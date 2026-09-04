// GET  /api/import/batches          → last 20 imports (list view)
// GET  /api/import/batches?id=<id>  → one import incl. the extraction for review
// PATCH /api/import/batches { id, status?: "discarded", label?: string }

import { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { importBatches } from "@/lib/db/schema";
import { jsonError, jsonOk } from "@/lib/api";
import { removeBatchFiles } from "@/lib/import/storage";

export const runtime = "nodejs";

function summary(b: typeof importBatches.$inferSelect) {
  return {
    id: b.id,
    createdAt: b.createdAt,
    sourceKind: b.sourceKind,
    status: b.status,
    itemCount: b.itemCount,
    label: b.label,
    imageCount: b.imageFiles?.length ?? 0,
    failed: b.status === "pending" && !!b.extractError,
  };
}

export async function GET(req: NextRequest) {
  const idParam = req.nextUrl.searchParams.get("id");
  if (idParam !== null) {
    const id = Number(idParam);
    if (!Number.isInteger(id) || id <= 0) return jsonError("Bad id", 400);
    const [b] = await db
      .select()
      .from(importBatches)
      .where(eq(importBatches.id, id))
      .limit(1);
    if (!b) return jsonError("Import not found", 404);
    return jsonOk({
      ...summary(b),
      rawText: b.rawText,
      note: b.note,
      model: b.model,
      providerLog: b.providerLog ?? [],
      extractError: b.extractError ?? null,
      extraction: b.extractedJson ?? null,
    });
  }

  const rows = await db
    .select()
    .from(importBatches)
    .orderBy(desc(importBatches.createdAt))
    .limit(20);
  return jsonOk({ batches: rows.map(summary) });
}

const Patch = z.object({
  id: z.number().int().positive(),
  status: z.literal("discarded").optional(),
  label: z.string().trim().max(80).optional(),
});

export async function PATCH(req: NextRequest) {
  let body: z.infer<typeof Patch>;
  try {
    body = Patch.parse(await req.json());
  } catch (err) {
    return jsonError(
      `Invalid body: ${err instanceof Error ? err.message : String(err)}`,
      400
    );
  }

  const [b] = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.id, body.id))
    .limit(1);
  if (!b) return jsonError("Import not found", 404);

  const update: Partial<typeof importBatches.$inferInsert> = {};
  if (body.status === "discarded") {
    if (b.status !== "pending") {
      return jsonError(`Cannot discard an import that is ${b.status}.`, 409);
    }
    update.status = "discarded";
  }
  if (body.label !== undefined) update.label = body.label || null;
  if (Object.keys(update).length === 0) return jsonOk(summary(b));

  if (body.status === "discarded") {
    try {
      await removeBatchFiles(body.id);
    } catch (err) {
      console.error("Could not remove discarded import files:", err);
      return jsonError("Could not remove the discarded notebook photos.", 500);
    }
  }
  await db.update(importBatches).set(update).where(eq(importBatches.id, body.id));
  const [fresh] = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.id, body.id))
    .limit(1);
  return jsonOk(summary(fresh));
}
