// GET /api/cards/next?mode=drill|flashcards|multiple_choice&count=10
//
// Returns the next N due cards, honoring the user's active tenses and levels.
// Each item includes verb metadata and the correct conjugated form so the
// client can render the prompt without a second round-trip.
//
// Selection is balanced across verbs (round-robin), so a handful of
// early-seeded verbs can't monopolize every batch while newer verbs sit
// behind the backlog. Within a verb, previously-reviewed overdue cards
// come first, then unseen cards in seed order.

import { NextRequest } from "next/server";
import { and, asc, eq, inArray, lte, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { cards, conjugations, verbs } from "@/lib/db/schema";
import { getSettings, jsonError, jsonOk } from "@/lib/api";
import { sameFormLoose } from "@/lib/normalize";
import { ensureSeeded } from "@/lib/seed/ensure-seeded";
import { PERSON_PRONOUNS, TENSE_LABELS, type Person, type Tense } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function GET(req: NextRequest) {
  await ensureSeeded();
  const url = new URL(req.url);
  const countParam = url.searchParams.get("count") ?? "10";
  const count = Math.min(50, Math.max(1, parseInt(countParam, 10) || 10));
  const mode = url.searchParams.get("mode") ?? "drill";
  const includeDistractors = mode === "multiple_choice";

  const s = await getSettings();
  const activeTenses = (s.activeTenses as string[]) ?? ["present"];
  const activeLevels = (s.activeLevels as string[]) ?? ["A1"];

  if (activeTenses.length === 0 || activeLevels.length === 0) {
    return jsonError("No active tenses or levels — visit Settings first.", 409);
  }

  const now = new Date();

  // Fetch the whole due pool for the active tenses/levels, then balance
  // across verbs in memory (a few thousand small rows at most).
  const pool = await db
    .select({
      cardId: cards.id,
      nextReviewAt: cards.nextReviewAt,
      repetitions: cards.repetitions,
      easeFactor: cards.easeFactor,
      intervalDays: cards.intervalDays,
      suspended: cards.suspended,
      wrongCount: cards.wrongCount,
      mnemonic: cards.mnemonic,
      conjugationId: conjugations.id,
      tense: conjugations.tense,
      person: conjugations.person,
      form: conjugations.form,
      isIrregular: conjugations.isIrregular,
      verbId: verbs.id,
      infinitive: verbs.infinitive,
      english: verbs.english,
      group: verbs.group,
      level: verbs.level,
      auxiliary: verbs.auxiliary,
    })
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

  // Group by verb; within each verb, reviewed-overdue cards first (most
  // overdue first), then unseen cards in seed order.
  type PoolRow = (typeof pool)[number];
  const byVerb = new Map<number, PoolRow[]>();
  for (const r of pool) {
    const group = byVerb.get(r.verbId);
    if (group) group.push(r);
    else byVerb.set(r.verbId, [r]);
  }
  for (const group of byVerb.values()) {
    group.sort((a, b) => {
      const aNew = a.repetitions === 0;
      const bNew = b.repetitions === 0;
      if (aNew !== bNew) return aNew ? 1 : -1;
      return aNew
        ? a.conjugationId - b.conjugationId
        : a.nextReviewAt.getTime() - b.nextReviewAt.getTime();
    });
  }

  // Round-robin across verbs (order shuffled per request) until full.
  const groups = shuffle([...byVerb.values()]);
  const rows: PoolRow[] = [];
  for (let i = 0; rows.length < count && groups.length > 0; ) {
    const group = groups[i % groups.length];
    const next = group.shift();
    if (next) rows.push(next);
    if (group.length === 0) {
      groups.splice(i % groups.length, 1);
      i = groups.length > 0 ? i % groups.length : 0;
    } else {
      i++;
    }
  }
  shuffle(rows);

  const items = await Promise.all(
    rows.map(async (r) => {
      const base = {
        cardId: r.cardId,
        verbId: r.verbId,
        infinitive: r.infinitive,
        english: r.english,
        group: r.group,
        level: r.level,
        auxiliary: r.auxiliary,
        tense: r.tense as Tense,
        tenseLabel: TENSE_LABELS[r.tense as Tense],
        person: r.person as Person,
        pronoun: PERSON_PRONOUNS[r.person as Person],
        form: r.form,
        isIrregular: r.isIrregular,
        repetitions: r.repetitions,
        wrongCount: r.wrongCount,
        mnemonic: r.mnemonic,
      };
      if (!includeDistractors) return base;

      // Distractors: 3 other conjugations for the same (tense, person),
      // filtered to unique forms and excluding the target form itself.
      const distractorRows = await db
        .select({ form: conjugations.form })
        .from(conjugations)
        .innerJoin(verbs, eq(verbs.id, conjugations.verbId))
        .where(
          and(
            eq(conjugations.tense, r.tense),
            eq(conjugations.person, r.person),
            ne(conjugations.id, r.conjugationId),
            inArray(verbs.level, activeLevels)
          )
        )
        .orderBy(asc(sql`random()`))
        .limit(12);

      const distractors: string[] = [];
      for (const d of distractorRows) {
        if (sameFormLoose(d.form, r.form)) continue;
        if (distractors.some((x) => sameFormLoose(x, d.form))) continue;
        distractors.push(d.form);
        if (distractors.length >= 3) break;
      }

      // Shuffle target + distractors for the options list
      const options = [r.form, ...distractors];
      for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
      }
      return { ...base, options };
    })
  );

  return jsonOk({
    cards: items,
    asOf: now.toISOString(),
  });
}
