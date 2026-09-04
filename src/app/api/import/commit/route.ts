// POST /api/import/commit
// { batchId: number, items: ItemIn[] }   — only the items the user approved,
// with whatever edits they made. This is the ONLY writer of learning_items.
//
// Dedupe: an item whose normKey already exists is merged (encounter count,
// importance, extra example) rather than inserted. Two identical items in
// the same submission collapse the same way because processing is sequential.

import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { importBatches, learningItems } from "@/lib/db/schema";
import { normKey } from "@/lib/import/norm-key";
import { jsonError, jsonOk } from "@/lib/api";
import { ITEM_CEFR_LEVELS, LEARNING_ITEM_TYPES } from "@/types";

export const runtime = "nodejs";

class BatchAlreadyHandled extends Error {}

const ItemIn = z.object({
  french: z.string().trim().min(1).max(300),
  english: z.string().trim().max(300),
  example_fr: z.string().trim().max(500),
  example_en: z.string().trim().max(500),
  type: z.enum(LEARNING_ITEM_TYPES),
  grammar_topic: z.string().trim().max(80),
  cefr_level: z.enum(ITEM_CEFR_LEVELS),
  priority: z.number().int().min(1).max(5),
  source_context: z.string().trim().max(500),
});

const Body = z.object({
  batchId: z.number().int().positive(),
  items: z.array(ItemIn).min(1).max(40),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return jsonError(
      `Invalid body: ${err instanceof Error ? err.message : String(err)}`,
      400
    );
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Claim the pending batch inside the same transaction. Concurrent retries
      // cannot both pass this update, and a later failure rolls the claim back.
      const claimed = await tx
        .update(importBatches)
        .set({ status: "committing" })
        .where(and(eq(importBatches.id, body.batchId), eq(importBatches.status, "pending")))
        .returning({ id: importBatches.id });
      if (claimed.length === 0) throw new BatchAlreadyHandled();

      const results: { french: string; action: "inserted" | "merged"; id: number }[] = [];
      for (const item of body.items) {
        const key = normKey(item.french);
        if (!key) continue;
        const [existing] = await tx
          .select()
          .from(learningItems)
          .where(eq(learningItems.normKey, key))
          .limit(1);

        if (existing) {
          const extra = existing.extraExamples ?? [];
          const newExample =
            item.example_fr &&
            item.example_fr !== existing.exampleFr &&
            !extra.some((e) => e.fr === item.example_fr)
              ? [...extra, { fr: item.example_fr, en: item.example_en, batchId: body.batchId }]
              : extra;
          await tx
            .update(learningItems)
            .set({
              encounterCount: existing.encounterCount + 1,
              importanceScore: existing.importanceScore + item.priority,
              priority: Math.max(existing.priority, item.priority),
              type: item.type === "correction" ? "correction" : existing.type,
              exampleFr: existing.exampleFr || item.example_fr,
              exampleEn: existing.exampleEn || item.example_en,
              sourceContext: existing.sourceContext || item.source_context,
              grammarTopic: existing.grammarTopic || item.grammar_topic,
              extraExamples: newExample,
            })
            .where(eq(learningItems.id, existing.id));
          results.push({ french: existing.french, action: "merged", id: existing.id });
        } else {
          const [row] = await tx
            .insert(learningItems)
            .values({
              french: item.french,
              english: item.english,
              exampleFr: item.example_fr,
              exampleEn: item.example_en,
              type: item.type,
              grammarTopic: item.grammar_topic,
              cefrLevel: item.cefr_level,
              priority: item.priority,
              sourceContext: item.source_context,
              batchId: body.batchId,
              normKey: key,
              importanceScore: item.priority,
              dueAt: new Date(),
            })
            .returning({ id: learningItems.id });
          results.push({ french: item.french, action: "inserted", id: row.id });
        }
      }

      const inserted = results.filter((r) => r.action === "inserted").length;
      const merged = results.length - inserted;
      await tx
        .update(importBatches)
        .set({ status: "reviewed", itemCount: results.length })
        .where(eq(importBatches.id, body.batchId));
      return { batchId: body.batchId, inserted, merged, results };
    });
    return jsonOk(result);
  } catch (err) {
    if (err instanceof BatchAlreadyHandled) {
      const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, body.batchId)).limit(1);
      if (!batch) return jsonError("Import not found", 404);
      return jsonError(`This import was already ${batch.status}.`, 409);
    }
    throw err;
  }
}
