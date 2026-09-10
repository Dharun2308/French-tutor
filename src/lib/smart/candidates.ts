import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { cards, conjugations, itemReviews, learningItems, phrases, verbs } from "@/lib/db/schema";
import { getSettings } from "@/lib/api";
import { cardFor } from "@/lib/items/card";
import { focusCooldownIds } from "@/lib/items/focus-plan";
import { rankWeakItems } from "@/lib/items/weak";
import { PERSON_PRONOUNS, TENSE_LABELS, type Person, type Tense } from "@/types";
import { selectSmartSources } from "./plan";
import type { SmartSource } from "./types";

const DAY = 86_400_000;
function reviewPriority(due: Date, wrong: number, correct: number, frequency: number, now: Date) {
  return (wrong ? 40 * wrong / (wrong + correct + 1) : 0)
    + Math.min(30, Math.max(0, (now.getTime() - due.getTime()) / DAY))
    + (wrong + correct > 0 ? 20 : 0) + 10 / Math.max(1, frequency);
}

export async function smartCandidates(now = new Date()): Promise<SmartSource[]> {
  const settings = await getSettings();
  const [personal, weak, reviews, verbRows, phraseRows] = await Promise.all([
    db.select().from(learningItems).where(and(eq(learningItems.suspended, false), lte(learningItems.dueAt, now))),
    rankWeakItems(now),
    db.select().from(itemReviews).where(gte(itemReviews.ratedAt, new Date(now.getTime() - 30 * DAY)))
      .orderBy(desc(itemReviews.ratedAt)).limit(2000),
    settings.activeTenses.length && settings.activeLevels.length
      ? db.select({ card: cards, conjugation: conjugations, verb: verbs }).from(cards)
        .innerJoin(conjugations, eq(conjugations.id, cards.conjugationId))
        .innerJoin(verbs, eq(verbs.id, conjugations.verbId))
        .where(and(eq(cards.suspended, false), lte(cards.nextReviewAt, now), inArray(conjugations.tense, settings.activeTenses), inArray(verbs.level, settings.activeLevels)))
      : [],
    settings.activePhraseCategories.length && settings.activeLevels.length
      ? db.select().from(phrases).where(and(eq(phrases.suspended, false), lte(phrases.nextReviewAt, now), inArray(phrases.category, settings.activePhraseCategories), inArray(phrases.level, settings.activeLevels)))
      : [],
  ]);
  const cooling = new Set(focusCooldownIds(reviews, now));
  const scores = new Map(weak.map(item => [item.id, item]));
  const candidates: SmartSource[] = personal.filter(item => !cooling.has(item.id)).map(item => {
    const ranked = scores.get(item.id);
    const face = cardFor(item);
    return {
      key: `personal:${item.id}`, kind: "personal", id: item.id, group: `personal:${item.id}`,
      label: item.grammarTopic || "Your lesson French", reason: item.failureCount ? "Strengthen a phrase you've missed" : item.type === "correction" ? "Put a tutor correction to use" : "Your lesson French is due for recall",
      score: ranked?.score ?? item.priority, level: item.cefrLevel, prompt: face.promptEn, target: face.targetFr,
      topic: `${item.type}: ${item.grammarTopic}`,
      evidence: reviews.filter(r => r.itemId === item.id && r.direction === "production" && r.rating < 2)
        .slice(0, 3).map(r => `${r.errorType ?? "recall"}: ${r.userAnswer ?? ""} → ${r.correctedAnswer ?? item.french}. ${r.gradeReason ?? ""}`),
    };
  });
  for (const { card, conjugation, verb } of verbRows) {
    candidates.push({
      key: `verb:${card.id}`, kind: "verb", id: card.id, group: `verb:${verb.id}`,
      label: `${verb.infinitive} · ${TENSE_LABELS[conjugation.tense as Tense] ?? conjugation.tense}`,
      reason: card.wrongCount ? "Revisit a conjugation you've missed" : "A due verb, used in context",
      score: reviewPriority(card.nextReviewAt, card.wrongCount, card.correctCount, verb.frequencyRank, now), level: verb.level,
      prompt: `Conjugate “${verb.infinitive}” (${verb.english}) for ${PERSON_PRONOUNS[conjugation.person as Person]} in ${TENSE_LABELS[conjugation.tense as Tense]}. Write only the verb form.`,
      target: conjugation.form, topic: conjugation.tense,
      verb: { infinitive: verb.infinitive, tense: conjugation.tense, person: conjugation.person, form: conjugation.form },
      evidence: [`${card.wrongCount} previous misses; ${card.correctCount} successful reviews.`],
    });
  }
  for (const phrase of phraseRows) {
    candidates.push({
      key: `phrase:${phrase.id}`, kind: "phrase", id: phrase.id, group: `phrase:${phrase.category}`,
      label: `Foundations · ${phrase.category.replace(/_/g, " ")}`,
      reason: phrase.wrongCount ? "Strengthen an everyday expression you've missed" : "A foundation ready for review",
      score: reviewPriority(phrase.nextReviewAt, phrase.wrongCount, phrase.correctCount, phrase.frequencyRank, now),
      level: phrase.level, prompt: `Write in French: ${phrase.english}`, target: phrase.french,
      topic: `${phrase.category}: ${phrase.notes ?? ""}`, evidence: [`${phrase.wrongCount} previous misses; ${phrase.correctCount} successful reviews.`],
    });
  }
  return selectSmartSources(candidates.filter(c => c.prompt.trim() && c.target.trim()), Math.max(6, Math.min(16, settings.dailyTarget)));
}
