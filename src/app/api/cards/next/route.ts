// GET /api/cards/next?mode=drill|flashcards|multiple_choice&count=10
//
// Returns the next N due cards, honoring the user's active tenses and levels.
// Each item includes verb metadata and the correct conjugated form so the
// client can render the prompt without a second round-trip.

import { NextRequest } from "next/server";
import { and, asc, eq, inArray, lte, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { cards, conjugations, verbs } from "@/lib/db/schema";
import { getSettings, jsonError, jsonOk } from "@/lib/api";
import { sameFormLoose } from "@/lib/normalize";
import { PERSON_PRONOUNS, TENSE_LABELS, type Person, type Tense } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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

  const rows = await db
    .select({
      cardId: cards.id,
      nextReviewAt: cards.nextReviewAt,
      repetitions: cards.repetitions,
      easeFactor: cards.easeFactor,
      intervalDays: cards.intervalDays,
      suspended: cards.suspended,
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
    )
    .orderBy(asc(cards.nextReviewAt), asc(sql`random()`))
    .limit(count);

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
