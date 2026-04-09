// GET /api/stats
// Returns dashboard stats: due count, streak, retention, weakest verbs.

import { and, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { cards, conjugations, phrases, verbs } from "@/lib/db/schema";
import { getSettings, jsonOk } from "@/lib/api";
import { startOfUserDay } from "@/lib/srs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSettings();
  const activeTenses = (s.activeTenses as string[]) ?? ["present"];
  const activeLevels = (s.activeLevels as string[]) ?? ["A1"];
  const activePhraseCategories =
    (s.activePhraseCategories as string[] | null) ?? [];
  const timezone = s.timezone ?? "UTC";
  const hasActiveTenses = activeTenses.length > 0;

  const now = new Date();
  const todayStart = startOfUserDay(now, timezone);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  // Verb card counts — only query if the user has active tenses.
  let dueNowVerb = 0;
  let dueTodayVerb = 0;
  let totalActiveVerb = 0;
  if (hasActiveTenses) {
    const dueNowRow = await db
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
    dueNowVerb = Number(dueNowRow[0]?.count ?? 0);

    const dueTodayRow = await db
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
    dueTodayVerb = Number(dueTodayRow[0]?.count ?? 0);

    const totalActiveRow = await db
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
    totalActiveVerb = Number(totalActiveRow[0]?.count ?? 0);
  }

  // Phrase card counts — only query if the user has active categories.
  let dueNowPhrase = 0;
  let dueTodayPhrase = 0;
  let totalActivePhrase = 0;
  if (activePhraseCategories.length > 0) {
    const dueNowRow = await db
      .select({ count: sql<number>`count(*)` })
      .from(phrases)
      .where(
        and(
          eq(phrases.suspended, false),
          lte(phrases.nextReviewAt, now),
          inArray(phrases.category, activePhraseCategories),
          inArray(phrases.level, activeLevels)
        )
      );
    dueNowPhrase = Number(dueNowRow[0]?.count ?? 0);

    const dueTodayRow = await db
      .select({ count: sql<number>`count(*)` })
      .from(phrases)
      .where(
        and(
          eq(phrases.suspended, false),
          lte(phrases.nextReviewAt, tomorrowStart),
          inArray(phrases.category, activePhraseCategories),
          inArray(phrases.level, activeLevels)
        )
      );
    dueTodayPhrase = Number(dueTodayRow[0]?.count ?? 0);

    const totalActiveRow = await db
      .select({ count: sql<number>`count(*)` })
      .from(phrases)
      .where(
        and(
          eq(phrases.suspended, false),
          inArray(phrases.category, activePhraseCategories),
          inArray(phrases.level, activeLevels)
        )
      );
    totalActivePhrase = Number(totalActiveRow[0]?.count ?? 0);
  }

  const dueNow = { count: dueNowVerb + dueNowPhrase };
  const dueTodayTotal = { count: dueTodayVerb + dueTodayPhrase };
  const totalActive = { count: totalActiveVerb + totalActivePhrase };

  // Seen cards (at least 1 review) — combine verb cards and phrase cards.
  const seenVerb = await db
    .select({
      correct: sql<number>`coalesce(sum(${cards.correctCount}), 0)`,
      wrong: sql<number>`coalesce(sum(${cards.wrongCount}), 0)`,
    })
    .from(cards)
    .where(gt(cards.repetitions, 0));

  const seenPhrase = await db
    .select({
      correct: sql<number>`coalesce(sum(${phrases.correctCount}), 0)`,
      wrong: sql<number>`coalesce(sum(${phrases.wrongCount}), 0)`,
    })
    .from(phrases)
    .where(gt(phrases.repetitions, 0));

  const correctTotal =
    Number(seenVerb[0]?.correct ?? 0) + Number(seenPhrase[0]?.correct ?? 0);
  const wrongTotal =
    Number(seenVerb[0]?.wrong ?? 0) + Number(seenPhrase[0]?.wrong ?? 0);
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
    dueNow: dueNow.count,
    dueTodayTotal: dueTodayTotal.count,
    totalActive: totalActive.count,
    // Per-type breakdowns so the dashboard can show separate sections.
    dueNowVerb,
    dueTodayVerb,
    totalActiveVerb,
    dueNowPhrase,
    dueTodayPhrase,
    totalActivePhrase,
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
    activePhraseCategories,
    learningStage: s.learningStage ?? "present",
    timezone,
  });
}
