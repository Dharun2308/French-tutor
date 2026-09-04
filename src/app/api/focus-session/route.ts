import { NextRequest } from "next/server";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { focusSessions, itemReviews, learningItems } from "@/lib/db/schema";
import { buildFocusPlan } from "@/lib/items/focus-plan";
import { rankWeakItems } from "@/lib/items/weak";
import { cardFor } from "@/lib/items/card";
import { jsonError, jsonOk } from "@/lib/api";

export const dynamic = "force-dynamic";

async function serialize(session: typeof focusSessions.$inferSelect) {
  const ids = session.plan.map((p) => p.itemId);
  const rows = ids.length ? await db.select().from(learningItems).where(inArray(learningItems.id, ids)) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return { sessionId: session.id, startedAt: session.startedAt, currentIndex: session.currentIndex, items: session.plan.flatMap((p) => { const r = byId.get(p.itemId); return r ? [{ ...p, id: r.id, type: r.type, ...cardFor(r) }] : []; }) };
}

export async function GET() {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const [active] = await db.select().from(focusSessions).where(and(eq(focusSessions.status, "active"), gte(focusSessions.startedAt, cutoff))).orderBy(desc(focusSessions.startedAt)).limit(1);
  if (active) return jsonOk(await serialize(active));
  const [items, weak, corrections] = await Promise.all([
    db.select().from(learningItems).where(eq(learningItems.suspended, false)),
    rankWeakItems(),
    db.select({ itemId: itemReviews.itemId }).from(itemReviews).where(and(eq(itemReviews.direction, "production"), gte(itemReviews.ratedAt, new Date(Date.now() - 30 * 86_400_000)))).orderBy(desc(itemReviews.ratedAt)).limit(100),
  ]);
  const correctionIds = [...new Set(corrections.map((x) => x.itemId).concat(items.filter((x) => x.type === "correction").map((x) => x.id)))];
  const plan = buildFocusPlan(items, weak.map((x) => x.id), correctionIds);
  if (plan.length === 0) {
    return jsonOk({ sessionId: null, startedAt: new Date(), currentIndex: 0, items: [] });
  }
  const [created] = await db.insert(focusSessions).values({ plan }).returning();
  return jsonOk(await serialize(created));
}

export async function POST(req: NextRequest) {
  let body: { sessionId: number; currentIndex: number; finish?: boolean };
  try { body = z.object({ sessionId: z.number().int().positive(), currentIndex: z.number().int().min(0).max(100), finish: z.boolean().optional() }).parse(await req.json()); }
  catch (e) { return jsonError(`Invalid body: ${e instanceof Error ? e.message : String(e)}`, 400); }
  await db.update(focusSessions).set({ currentIndex: body.currentIndex, status: body.finish ? "finished" : "active", endedAt: body.finish ? new Date() : null }).where(eq(focusSessions.id, body.sessionId));
  return jsonOk({ saved: true });
}
