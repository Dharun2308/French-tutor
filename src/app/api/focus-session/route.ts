import { NextRequest } from "next/server";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { focusSessions, itemReviews, learningItems } from "@/lib/db/schema";
import { buildFocusPlan, focusCooldownIds, FOCUS_COOLDOWN_MS } from "@/lib/items/focus-plan";
import { rankWeakItems } from "@/lib/items/weak";
import { serializeFocusSession as serialize } from "@/lib/items/focus-session";
import { getWeeklyPracticeIds } from "@/lib/items/weekly-practice-server";
import { jsonError, jsonOk } from "@/lib/api";

export const dynamic = "force-dynamic";

async function loadSession() {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const [active] = await db.select().from(focusSessions).where(and(eq(focusSessions.status, "active"), gte(focusSessions.startedAt, cutoff))).orderBy(desc(focusSessions.startedAt)).limit(1);
  if (active) return jsonOk(await serialize(active));
  const now = new Date();
  const [items, weak, corrections, weeklyIds, reviews] = await Promise.all([
    db.select().from(learningItems).where(eq(learningItems.suspended, false)),
    rankWeakItems(),
    db.select({ itemId: itemReviews.itemId }).from(itemReviews).where(and(eq(itemReviews.direction, "production"), lte(itemReviews.rating, 1), gte(itemReviews.ratedAt, new Date(Date.now() - 30 * 86_400_000)))).orderBy(desc(itemReviews.ratedAt)).limit(100),
    getWeeklyPracticeIds(),
    db.select({ itemId: itemReviews.itemId, rating: itemReviews.rating, direction: itemReviews.direction, ratedAt: itemReviews.ratedAt })
      .from(itemReviews).where(gte(itemReviews.ratedAt, new Date(now.getTime() - FOCUS_COOLDOWN_MS))),
  ]);
  const correctionIds = [...new Set(corrections.map((x) => x.itemId).concat(items.filter((x) => x.type === "correction").map((x) => x.id)))];
  const plan = buildFocusPlan(items, weak.map((x) => x.id), correctionIds, now, weeklyIds, focusCooldownIds(reviews, now));
  const byId = new Map(items.map(item => [item.id, item]));
  // Up to three new production contexts, prioritizing corrections then other repeated targets.
  const targets = plan.filter(entry => entry.direction === "production" && ["weekly", "weak", "correction"].includes(entry.source)
    && ((byId.get(entry.itemId)?.reps ?? 0) > 0 || (byId.get(entry.itemId)?.failureCount ?? 0) > 0));
  targets.sort((a, b) => Number(b.source === "correction") - Number(a.source === "correction"));
  targets.slice(0, 3).forEach(entry => { entry.freshContext = true; });
  if (plan.length === 0) {
    return jsonOk({ sessionId: null, startedAt: now, currentIndex: 0, items: [], caughtUp: items.length > 0 });
  }
  const [created] = await db.insert(focusSessions).values({ plan }).returning();
  return jsonOk(await serialize(created));
}

let loading: Promise<Awaited<ReturnType<typeof loadSession>>> | undefined;
export async function GET() {
  // React mounts or concurrent tabs must reuse the same newly created session.
  loading ??= loadSession().finally(() => { loading = undefined; });
  return (await loading).clone();
}

export async function POST(req: NextRequest) {
  let body: { sessionId: number; currentIndex: number; finish?: boolean; restart?: boolean };
  try { body = z.object({ sessionId: z.number().int().positive(), currentIndex: z.number().int().min(0).max(100), finish: z.boolean().optional(), restart: z.boolean().optional() }).parse(await req.json()); }
  catch (e) { return jsonError(`Invalid body: ${e instanceof Error ? e.message : String(e)}`, 400); }
  await db.update(focusSessions).set({ currentIndex: body.currentIndex, status: body.restart ? "abandoned" : body.finish ? "finished" : "active", endedAt: body.finish || body.restart ? new Date() : null }).where(eq(focusSessions.id, body.sessionId));
  return jsonOk({ saved: true });
}
