// GET /api/stats
// Returns dashboard stats: due count, streak, retention, weakest verbs.

import { and, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { cards, conjugations, verbs } from "@/lib/db/schema";
import { getSettings, jsonOk } from "@/lib/api";
import { startOfUserDay } from "@/lib/srs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSettings();
  const activeTenses = (s.activeTenses as string[]) ?? ["present"];
  const activeLevels = (s.activeLevels as string[]) ?? ["A1"];
  const timezone = s.timezone ?? "UTC";

  const now = new Date();
  const todayStart = startOfUserDay(now, timezone);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  // Due now (active card count where next_review_at <= now)
  const dueNow = await db
    .select({ count: sql<number>`count(*)` })
    .from(cards)
    .innerJoin(conjugations, eq(conjugations.id, cards.conjugationId))
    .innerJoin(verbs, eq(verbs.id, conjugations.verbId))
    .where(
      and(
        eq(cards.suspended, false),
        lte(cards.nextReviewAt, now),
        inArray(conjugations.tense, activeTenses),
        inArray(verbs.level, activeLevels)
      )
    );

  // Due today total (up to tomorrowStart)
  const dueTodayTotal = await db
    .select({ count: sql<number>`count(*)` })
    .from(cards)
    .innerJoin(conjugations, eq(conjugations.id, cards.conjugationId))
    .innerJoin(verbs, eq(verbs.id, conjugations.verbId))
    .where(
      and(
        eq(cards.suspended, false),
        lte(cards.nextReviewAt, tomorrowStart),
        inArray(conjugations.tense, activeTenses),
        inArray(verbs.level, activeLevels)
      )
    );

  // Total active cards
  const totalActive = await db
    .select({ count: sql<number>`count(*)` })
    .from(cards)
    .innerJoin(conjugations, eq(conjugations.id, cards.conjugationId))
    .innerJoin(verbs, eq(verbs.id, conjugations.verbId))
    .where(
      and(
        eq(cards.suspended, false),
        inArray(conjugations.tense, activeTenses),
        inArray(verbs.level, activeLevels)
      )
    );

  // Seen cards (at least 1 review)
  const seen = await db
    .select({
      correct: sql<number>`coalesce(sum(${cards.correctCount}), 0)`,
      wrong: sql<number>`coalesce(sum(${cards.wrongCount}), 0)`,
    })
    .from(cards)
    .where(gt(cards.repetitions, 0));

  const correctTotal = seen[0]?.correct ?? 0;
  const wrongTotal = seen[0]?.wrong ?? 0;
  const retention =
    correctTotal + wrongTotal > 0
      ? Math.round((correctTotal / (correctTotal + wrongTotal)) * 100)
      : 0;

  // Weakest verbs (by wrong-count, among seen cards)
  const weakest = await db
    .select({
      verbId: verbs.id,
      infinitive: verbs.infinitive,
      english: verbs.english,
      wrongSum: sql<number>`sum(${cards.wrongCount})`,
      correctSum: sql<number>`sum(${cards.correctCount})`,
    })
    .from(cards)
    .innerJoin(conjugations, eq(conjugations.id, cards.conjugationId))
    .innerJoin(verbs, eq(verbs.id, conjugations.verbId))
    .where(gt(cards.repetitions, 0))
    .groupBy(verbs.id, verbs.infinitive, verbs.english)
    .orderBy(desc(sql`sum(${cards.wrongCount})`))
    .limit(10);

  const weakestFiltered = weakest.filter((w) => Number(w.wrongSum ?? 0) > 0);

  return jsonOk({
    dueNow: Number(dueNow[0]?.count ?? 0),
    dueTodayTotal: Number(dueTodayTotal[0]?.count ?? 0),
    totalActive: Number(totalActive[0]?.count ?? 0),
    dailyTarget: s.dailyTarget,
    retention,
    correctTotal,
    wrongTotal,
    weakest: weakestFiltered.map((w) => ({
      verbId: w.verbId,
      infinitive: w.infinitive,
      english: w.english,
      wrong: Number(w.wrongSum ?? 0),
      correct: Number(w.correctSum ?? 0),
    })),
    activeTenses,
    activeLevels,
    timezone,
  });
}
