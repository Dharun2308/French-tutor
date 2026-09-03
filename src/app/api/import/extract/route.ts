// POST /api/import/extract
//   { images?: string[] (data: URLs), text?: string, note?: string, label?: string }
//   { batchId }   ← retry a batch whose extraction failed (photos already stored)
//
// Stores the photos + an import_batches row, runs extraction through the
// provider chain (codex → claude → openai, per Settings), annotates each
// item with duplicate hits, and saves the result on the batch so the review
// page can reload it. Writes NOTHING to learning_items — that only happens in
// /api/import/commit after the user approves.
//
// When every provider fails the batch is kept (status pending, extractError
// set, photos on disk) so the user can retry without re-photographing.

import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import path from "node:path";
import { db } from "@/lib/db/client";
import { importBatches } from "@/lib/db/schema";
import {
  ExtractionJsonSchema,
  ExtractionSchema,
  extractionSystemPrompt,
  extractionUserPrompt,
} from "@/lib/import/extract-prompt";
import { findDuplicates } from "@/lib/import/dedupe";
import { batchDir, removeBatchFiles, saveDataUrl } from "@/lib/import/storage";
import {
  AllProvidersFailed,
  getEnabledProviders,
  runStructured,
  summarizeAttempts,
  type ProviderAttempt,
} from "@/lib/ai/providers";
import { jsonError, jsonOk } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Cut a model-written summary to ≤80 chars at a word boundary — it is shown as-is on the phone. */
function trimLabel(s: string): string {
  const t = s.trim();
  if (t.length <= 80) return t;
  const cut = t.slice(0, 80);
  const at = cut.lastIndexOf(" ");
  return (at > 40 ? cut.slice(0, at) : cut).replace(/[\s,;:—-]+$/, "") + "…";
}

const NewBody = z
  .object({
    images: z.array(z.string().max(4_000_000)).max(6).default([]),
    text: z.string().max(10_000).optional(),
    note: z.string().max(300).optional(),
    label: z.string().max(80).optional(),
  })
  .refine((b) => b.images.length > 0 || (b.text?.trim().length ?? 0) > 0, {
    message: "Add at least one photo or some pasted text.",
  });

const RetryBody = z.object({ batchId: z.number().int().positive() });

export async function POST(req: NextRequest) {
  const rl = rateLimit("import_extract", 20, 60_000);
  if (!rl.allowed) return jsonError("Too many imports. Slow down a moment.", 429);

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const retry = RetryBody.safeParse(json);
  if (retry.success) return retryBatch(retry.data.batchId);

  let body: z.infer<typeof NewBody>;
  try {
    body = NewBody.parse(json);
  } catch (err) {
    return jsonError(
      `Invalid body: ${err instanceof Error ? err.message : String(err)}`,
      400
    );
  }

  const [batch] = await db
    .insert(importBatches)
    .values({
      sourceKind: body.images.length > 0 ? "photo" : "text",
      rawText: body.text?.trim() || null,
      note: body.note?.trim() || null,
      label: body.label?.trim() || null,
    })
    .returning({ id: importBatches.id });
  const batchId = batch.id;

  let imageFiles: string[] = [];
  try {
    imageFiles = await Promise.all(
      body.images.map((dataUrl, n) => saveDataUrl(batchId, n, dataUrl))
    );
    await db.update(importBatches).set({ imageFiles }).where(eq(importBatches.id, batchId));
  } catch (err) {
    // Nothing worth keeping yet — drop the row and files.
    await removeBatchFiles(batchId);
    await db.delete(importBatches).where(eq(importBatches.id, batchId));
    return jsonError(
      `Could not store photos: ${err instanceof Error ? err.message : String(err)}`,
      400
    );
  }

  return extractBatch(batchId, {
    imageFiles,
    text: body.text,
    note: body.note,
    label: body.label,
  });
}

async function retryBatch(batchId: number) {
  const [b] = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.id, batchId))
    .limit(1);
  if (!b) return jsonError("Import not found", 404);
  if (b.status !== "pending") return jsonError(`This import was already ${b.status}.`, 409);
  return extractBatch(batchId, {
    imageFiles: b.imageFiles ?? [],
    text: b.rawText ?? undefined,
    note: b.note ?? undefined,
    label: b.label ?? undefined,
  });
}

async function extractBatch(
  batchId: number,
  src: { imageFiles: string[]; text?: string; note?: string; label?: string }
) {
  const imagePaths = src.imageFiles.map((f) => path.join(batchDir(batchId), f));
  const enabled = await getEnabledProviders();

  let attempts: ProviderAttempt[] = [];
  try {
    const r = await runStructured(
      {
        purpose: "extract",
        system: extractionSystemPrompt(),
        user: extractionUserPrompt({
          imageCount: imagePaths.length,
          text: src.text,
          note: src.note,
        }),
        schemaName: "lesson_extraction",
        jsonSchema: ExtractionJsonSchema as unknown as Record<string, unknown>,
        imagePaths,
        batchId,
      },
      ExtractionSchema,
      enabled
    );
    attempts = r.attempts;

    const extraction = r.data;
    const duplicates = await findDuplicates(extraction.items.map((i) => i.french));
    const items = extraction.items.map((it, i) => ({ ...it, duplicates: duplicates[i] }));
    const label = src.label?.trim() || trimLabel(extraction.lesson_summary) || null;

    await db
      .update(importBatches)
      .set({
        model: `${r.provider}:${r.model}`,
        label,
        itemCount: items.length,
        providerLog: attempts,
        extractError: null,
        extractedJson: { lesson_summary: extraction.lesson_summary, items },
      })
      .where(eq(importBatches.id, batchId));

    return jsonOk({
      batchId,
      label,
      lessonSummary: extraction.lesson_summary,
      imageCount: imagePaths.length,
      items,
      provider: r.provider,
      model: r.model,
      attempts,
    });
  } catch (err) {
    attempts = err instanceof AllProvidersFailed ? err.attempts : attempts;
    const summary =
      err instanceof AllProvidersFailed
        ? summarizeAttempts(err.attempts)
        : err instanceof Error
          ? err.message
          : String(err);
    console.error(`Import extraction failed (batch ${batchId}): ${summary}`);
    await db
      .update(importBatches)
      .set({ providerLog: attempts, extractError: summary })
      .where(eq(importBatches.id, batchId));
    return new Response(
      JSON.stringify({
        error: `Extraction failed — ${summary}`,
        batchId,
        attempts,
        retryable: true,
      }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }
}
