import { NextRequest } from "next/server";
import { and, desc, eq, or, gte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { itemVariations, learningItems } from "@/lib/db/schema";
import { getEnabledProviders, runStructured } from "@/lib/ai/providers";
import { jsonError, jsonOk } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";

const Variation = z.object({ prompt_en: z.string().min(2).max(300), target_fr: z.string().min(2).max(300), note: z.string().max(300) });
const jsonSchema = {
  type: "object", additionalProperties: false, required: ["prompt_en", "target_fr", "note"],
  properties: { prompt_en: { type: "string" }, target_fr: { type: "string" }, note: { type: "string" } },
};

export async function GET() {
  const rows = await db.select({ id: learningItems.id, french: learningItems.french, english: learningItems.english, failureCount: learningItems.failureCount, lapses: learningItems.lapses })
    .from(learningItems)
    .where(and(eq(learningItems.suspended, false), or(gte(learningItems.failureCount, 2), gte(learningItems.lapses, 2))))
    .orderBy(desc(learningItems.failureCount), desc(learningItems.lapses)).limit(20);
  return jsonOk({ items: rows });
}

export async function POST(req: NextRequest) {
  if (!rateLimit("item_variation", 12, 60_000).allowed) return jsonError("Too many variation requests", 429);
  let body: { itemId: number; regenerate?: boolean };
  try { body = z.object({ itemId: z.number().int().positive(), regenerate: z.boolean().optional() }).parse(await req.json()); }
  catch (e) { return jsonError(`Invalid body: ${e instanceof Error ? e.message : String(e)}`, 400); }
  const [item] = await db.select().from(learningItems).where(eq(learningItems.id, body.itemId)).limit(1);
  if (!item) return jsonError("Item not found", 404);
  if (item.failureCount < 2 && item.lapses < 2) return jsonError("Fresh contexts unlock after this item is missed twice", 409);
  if (!body.regenerate) {
    const [cached] = await db.select().from(itemVariations).where(eq(itemVariations.itemId, item.id)).orderBy(desc(itemVariations.createdAt)).limit(1);
    if (cached) return jsonOk({ variation: cached, cached: true });
  }
  try {
    const result = await runStructured({
      purpose: "variation",
      system: "You create one natural A2 French production exercise. Preserve the exact meaning and useful phrase from the learner's item. Use a genuinely new everyday context. Do not introduce obscure vocabulary. Return JSON only.",
      user: `Personal item:\nFrench: ${item.french}\nEnglish: ${item.english}\nExisting example: ${item.exampleFr} — ${item.exampleEn}\nCreate a new English prompt and its natural French answer. The answer must exercise the same phrase or correction. Keep it short.`,
      schemaName: "item_variation", jsonSchema,
    }, Variation, await getEnabledProviders());
    const [saved] = await db.insert(itemVariations).values({ itemId: item.id, promptEn: result.data.prompt_en, targetFr: result.data.target_fr, note: result.data.note, provider: result.provider, model: result.model }).returning();
    return jsonOk({ variation: saved, cached: false });
  } catch (e) { return jsonError(e instanceof Error ? e.message : String(e), 502); }
}
