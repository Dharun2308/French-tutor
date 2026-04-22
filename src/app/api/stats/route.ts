// GET /api/stats
// Returns dashboard stats: due count, streak, retention, weakest verbs.

import { and, desc, eq, gt, gte, inArray, lte, sql } from "drizzle-orm";
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

  // Seen cards — scoped to active tenses/levels/categories.
  let seenVerbCorrect = 0;
  let seenVerbWrong = 0;
  if (hasActiveTenses) {
    const seenVerb = await db
      .select({
        correct: sql<number>`coalesce(sum(${cards.correctCount}), 0)`,
        wrong: sql<number>`coalesce(sum(${cards.wrongCount}), 0)`,
      })
      .from(cards)
      .innerJoin(conjugations, eq(conjugations.id, cards.conjugationId))
      .innerJoin(verbs, eq(verbs.id, conjugations.verbId))
      .where(
        and(
          gt(cards.repetitions, 0),
          inArray(conjugations.tense, activeTenses),
          inArray(verbs.level, activeLevels)
        )
      );
    seenVerbCorrect = Number(seenVerb[0]?.correct ?? 0);
    seenVerbWrong = Number(seenVerb[0]?.wrong ?? 0);
  }

  let seenPhraseCorrect = 0;
  let seenPhraseWrong = 0;
  if (activePhraseCategories.length > 0) {
    const seenPhrase = await db
      .select({
        correct: sql<number>`coalesce(sum(${phrases.correctCount}), 0)`,
        wrong: sql<number>`coalesce(sum(${phrases.wrongCount}), 0)`,
      })
      .from(phrases)
      .where(
        and(
          gt(phrases.repetitions, 0),
          inArray(phrases.category, activePhraseCategories),
          inArray(phrases.level, activeLevels)
        )
      );
    seenPhraseCorrect = Number(seenPhrase[0]?.correct ?? 0);
    seenPhraseWrong = Number(seenPhrase[0]?.wrong ?? 0);
  }

  // Reviews completed today — scoped to active settings.
  let reviewedTodayVerb = 0;
  if (hasActiveTenses) {
    const row = await db
      .select({ count: sql<number>`count(*)` })
      .from(cards)
      .innerJoin(conjugations, eq(conjugations.id, cards.conjugationId))
      .innerJoin(verbs, eq(verbs.id, conjugations.verbId))
      .where(
        and(
          gt(cards.repetitions, 0),
          gte(cards.lastReviewedAt, todayStart),
          inArray(conjugations.tense, activeTenses),
          inArray(verbs.level, activeLevels)
        )
      );
    reviewedTodayVerb = Number(row[0]?.count ?? 0);
  }
  let reviewedTodayPhrase = 0;
  if (activePhraseCategories.length > 0) {
    const row = await db
      .select({ count: sql<number>`count(*)` })
      .from(phrases)
      .where(
        and(
          gt(phrases.repetitions, 0),
          gte(phrases.lastReviewedAt, todayStart),
          inArray(phrases.category, activePhraseCategories),
          inArray(phrases.level, activeLevels)
        )
      );
    reviewedTodayPhrase = Number(row[0]?.count ?? 0);
  }
  const reviewedToday = reviewedTodayVerb + reviewedTodayPhrase;

  const correctTotal = seenVerbCorrect + seenPhraseCorrect;
  const wrongTotal = seenVerbWrong + seenPhraseWrong;
  const retention =
    correctTotal + wrongTotal > 0
      ? Math.round((correctTotal / (correctTotal + wrongTotal)) * 100)
      : 0;

  // Weakest verbs — scoped to active tenses/levels.
  let weakestFiltered: Array<{
    verbId: number;
    infinitive: string;
    english: string;
    wrongSum: number;
    correctSum: number;
  }> = [];
  if (hasActiveTenses) {
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
      .where(
        and(
          gt(cards.repetitions, 0),
          inArray(conjugations.tense, activeTenses),
          inArray(verbs.level, activeLevels)
        )
      )
      .groupBy(verbs.id, verbs.infinitive, verbs.english)
      .orderBy(desc(sql`sum(${cards.wrongCount})`))
      .limit(10);
    weakestFiltered = weakest
      .filter((w) => Number(w.wrongSum ?? 0) > 0)
      .map((w) => ({
        verbId: w.verbId,
        infinitive: w.infinitive,
        english: w.english,
        wrongSum: Number(w.wrongSum ?? 0),
        correctSum: Number(w.correctSum ?? 0),
      }));
  }

  // Weakest phrases — scoped to active categories/levels.
  let weakestPhrases: Array<{
    phraseId: number;
    french: string;
    english: string;
    category: string;
    wrongCount: number;
    correctCount: number;
  }> = [];
  if (activePhraseCategories.length > 0) {
    const wp = await db
      .select({
        phraseId: phrases.id,
        french: phrases.french,
        english: phrases.english,
        category: phrases.category,
        wrongCount: phrases.wrongCount,
        correctCount: phrases.correctCount,
      })
      .from(phrases)
      .where(
        and(
          gt(phrases.repetitions, 0),
          gt(phrases.wrongCount, 0),
          inArray(phrases.category, activePhraseCategories),
          inArray(phrases.level, activeLevels)
        )
      )
      .orderBy(desc(phrases.wrongCount))
      .limit(10);
    weakestPhrases = wp.map((p) => ({
      phraseId: p.phraseId,
      french: p.french,
      english: p.english,
      category: p.category,
      wrongCount: p.wrongCount,
      correctCount: p.correctCount,
    }));
  }

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
    reviewedToday,
    retention,
    correctTotal,
    wrongTotal,
    weakest: weakestFiltered.map((w) => ({
      verbId: w.verbId,
      infinitive: w.infinitive,
      english: w.english,
      wrong: w.wrongSum,
      correct: w.correctSum,
    })),
    weakestPhrases: weakestPhrases.map((p) => ({
      phraseId: p.phraseId,
      french: p.french,
      english: p.english,
      category: p.category,
      wrong: p.wrongCount,
      correct: p.correctCount,
    })),
    activeTenses,
    activeLevels,
    activePhraseCategories,
    learningStage: s.learningStage ?? "present",
    timezone,
  });
}
