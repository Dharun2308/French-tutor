import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { focusSessions, itemVariations, learningItems } from "@/lib/db/schema";
import { cardFor } from "./card";
import { focusVariationSchema, generateFocusVariation } from "./focus-variation";

export async function serializeFocusSession(session: typeof focusSessions.$inferSelect) {
  const ids = session.plan.map(p => p.itemId);
  const variationIds = session.plan.flatMap(p => p.variationId ? [p.variationId] : []);
  const [rows, variations] = await Promise.all([
    ids.length ? db.select().from(learningItems).where(inArray(learningItems.id, ids)) : [],
    variationIds.length ? db.select().from(itemVariations).where(inArray(itemVariations.id, variationIds)) : [],
  ]);
  const byId = new Map(rows.map(r => [r.id, r]));
  const byVariation = new Map(variations.map(v => [v.id, v]));
  return { sessionId: session.id, startedAt: session.startedAt, currentIndex: session.currentIndex,
    items: session.plan.map((entry, index) => {
      const item = byId.get(entry.itemId);
      // Keep plan indices stable if an item was deleted between visits.
      if (!item) return { ...entry, index, id: entry.itemId, unavailable: true, promptEn: "This item is no longer available.", targetFr: "" };
      const variation = entry.variationId ? byVariation.get(entry.variationId) : undefined;
      if (entry.variationId && (!variation || variation.itemId !== item.id)) return { ...entry, index, id: item.id, unavailable: true, promptEn: "This saved context is no longer available.", targetFr: "" };
      return { ...entry, index, id: item.id, type: item.type, unavailable: false,
        ...(variation ? { promptEn: variation.promptEn, targetFr: variation.targetFr } : cardFor(item)) };
    }) };
}

const preparing = new Map<string, Promise<Awaited<ReturnType<typeof serializeFocusSession>>>>();

/** Materialize once, with an atomic plan comparison so concurrent loads cannot replace a shown card. */
export function prepareFocusCard(sessionId: number, index: number, generate = generateFocusVariation) {
  const key = `${sessionId}:${index}`;
  const existing = preparing.get(key);
  if (existing) return existing;
  const job = (async () => {
    const [session] = await db.select().from(focusSessions).where(eq(focusSessions.id, sessionId)).limit(1);
    if (!session || session.status !== "active" || session.currentIndex !== index || !session.plan[index]) throw new Error("This focus card is no longer current. Reload the session.");
    const entry = session.plan[index];
    if (!entry.freshContext || entry.variationId || entry.variationUnavailable) return serializeFocusSession(session);
    const [item] = await db.select().from(learningItems).where(eq(learningItems.id, entry.itemId)).limit(1);
    if (!item) throw new Error("This lesson item is no longer available.");
    const history = await db.select({ promptEn: itemVariations.promptEn, targetFr: itemVariations.targetFr })
      .from(itemVariations).where(eq(itemVariations.itemId, item.id)).orderBy(desc(itemVariations.createdAt)).limit(20);
    const plan = structuredClone(session.plan);
    try {
      const variation = await generate(item, history);
      focusVariationSchema(item, history).parse({ prompt_en: variation.promptEn, target_fr: variation.targetFr, note: variation.note });
      const [saved] = await db.insert(itemVariations).values({ itemId: item.id, ...variation }).returning();
      plan[index].variationId = saved.id;
    } catch {
      // A saved fallback is stable too; retrying/resuming must not swap a card under an answer.
      plan[index].variationUnavailable = true;
    }
    await db.update(focusSessions).set({ plan }).where(and(eq(focusSessions.id, sessionId),
      eq(focusSessions.status, "active"), eq(focusSessions.currentIndex, index), eq(focusSessions.plan, session.plan)));
    const [current] = await db.select().from(focusSessions).where(eq(focusSessions.id, sessionId)).limit(1);
    if (!current || current.status !== "active" || current.currentIndex !== index) throw new Error("This focus card changed while preparing. Reload the session.");
    return serializeFocusSession(current);
  })().finally(() => { preparing.delete(key); });
  preparing.set(key, job);
  return job;
}
