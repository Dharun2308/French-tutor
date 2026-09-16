import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { itemReviews, learningItems, phrases } from "@/lib/db/schema";
import { getSettings } from "@/lib/api";
import { cardFor } from "@/lib/items/card";
import { focusCooldownIds } from "@/lib/items/focus-plan";
import { rankWeakItems } from "@/lib/items/weak";
import { PHRASE_CATEGORY_LABELS, type PhraseCategory, type Rating } from "@/types";
import { foundationsReviews } from "./schema";
import { challengeFor, recallMemory, selectFoundations } from "./plan";
import type { FoundationsMix, FoundationsSource } from "./types";

export async function foundationsCandidates(mix: FoundationsMix = "blend", now = new Date()) {
  const settings = await getSettings();
  const cutoff = new Date(now.getTime() - 180 * 86_400_000);
  const [personal, ranked, noteReviews, previous, base] = await Promise.all([
    db.select().from(learningItems).where(eq(learningItems.suspended, false)),
    rankWeakItems(now),
    db.select().from(itemReviews).where(and(eq(itemReviews.direction, "production"), gte(itemReviews.ratedAt, cutoff)))
      .orderBy(desc(itemReviews.ratedAt), desc(itemReviews.id)).limit(10_000),
    db.select().from(foundationsReviews).where(eq(foundationsReviews.independent, true))
      .orderBy(desc(foundationsReviews.ratedAt), desc(foundationsReviews.id)).limit(10_000),
    settings.activePhraseCategories.length && settings.activeLevels.length
      ? db.select().from(phrases).where(and(eq(phrases.suspended, false), inArray(phrases.category, settings.activePhraseCategories), inArray(phrases.level, settings.activeLevels)))
      : [],
  ]);
  const weak = new Map(ranked.map(item => [item.id, item]));
  const cooled = new Set(focusCooldownIds(noteReviews, now));
  const sources: FoundationsSource[] = [];
  const historyFor = (key: string) => previous.filter(r => r.sourceKey === key).slice(0, 20);
  for (const item of personal) {
    if (cooled.has(item.id) || item.type === "pronunciation") continue;
    const key = `personal:${item.id}`;
    const history = historyFor(key);
    // Item reviews already contain independent Foundations reviews; don't count twice.
    const recent = noteReviews.filter(r => r.itemId === item.id).slice(0, 20);
    const memory = recallMemory(recent.map(r => ({ rating: r.rating as Rating, ratedAt: r.ratedAt })));
    const face = cardFor(item);
    const retry = history[0]?.rating < 2 && (!recent[0] || history[0].ratedAt.getTime() >= recent[0].ratedAt.getTime());
    const repeated = memory.recentStruggles >= 2 || (memory.lastRating === null && item.failureCount >= 2);
    sources.push({
      key, id: item.id, kind: "personal", group: `personal:${item.grammarTopic || item.type}`,
      label: item.grammarTopic || "Lesson expression", prompt: face.promptEn, target: face.targetFr,
      topic: `${item.type}: ${item.grammarTopic}`, level: item.cefrLevel,
      dueAt: item.dueAt.toISOString(), reviewed: item.reviewCount > 0, memory,
      challenge: challengeFor(memory, item.failureCount),
      reason: repeated ? "Repeated difficulty in your lesson French" : memory.lastRating === 1 ? "You rated this Hard" : memory.lastRating === 0 ? "You rated this Again" : item.reviewCount ? "Your lesson phrase is due" : "Use a lesson expression in a fuller sentence",
      score: (weak.get(item.id)?.score ?? item.priority * 5) + memory.recentStruggles * 30 + (memory.lastRating === 0 ? 25 : memory.lastRating === 1 ? 15 : 0),
      evidence: recent.filter(r => r.rating < 2).slice(0, 3).map(r => `${r.rating === 0 ? "Again" : "Hard"}: ${r.userAnswer ?? ""} → ${r.correctedAnswer ?? item.french}. ${r.gradeReason ?? ""}`),
      retryExercise: retry ? history[0].exercise : undefined,
    });
  }
  for (const phrase of base) {
    // Alphabet recognition is a separate skill; this mode practices usable sentences.
    if (phrase.category === "alphabet") continue;
    const key = `phrase:${phrase.id}`;
    const history = historyFor(key);
    const memory = recallMemory(history);
    const repeated = memory.recentStruggles >= 2 || (memory.lastRating === null && phrase.wrongCount >= 2);
    const reviewed = phrase.correctCount + phrase.wrongCount > 0;
    const overdue = reviewed ? Math.min(25, Math.max(0, (now.getTime() - phrase.nextReviewAt.getTime()) / 86_400_000)) : 0;
    const recentRisk = memory.lastRating === 0 ? 25 : memory.lastRating === 1 ? 15 : 0;
    sources.push({
      key, id: phrase.id, kind: "phrase", group: `phrase:${phrase.category}`,
      label: PHRASE_CATEGORY_LABELS[phrase.category as PhraseCategory] ?? phrase.category,
      prompt: phrase.category.startsWith("fill_") ? `Fill the blank: ${phrase.english}` : `Write in French: ${phrase.english}`,
      target: phrase.french, topic: `${phrase.category}: ${phrase.notes ?? ""}`, level: phrase.level,
      dueAt: phrase.nextReviewAt.toISOString(), reviewed, memory,
      challenge: challengeFor(memory, phrase.wrongCount),
      reason: repeated ? "Repeated difficulty with this expression" : memory.lastRating === 1 ? "You rated this Hard" : memory.lastRating === 0 ? "You rated this Again" : reviewed ? "An everyday expression ready for review" : "Use familiar vocabulary in a fuller sentence",
      score: memory.recentStruggles * 30 + recentRisk + (reviewed ? 20 : 0) + overdue
        + (memory.lastRating === null ? Math.min(50, phrase.wrongCount * 15) : 0) + 10 / Math.max(1, phrase.frequencyRank),
      evidence: history.filter(r => r.rating < 2).slice(0, 3).map(r => `${r.rating === 0 ? "Again" : "Hard"}: ${r.answer} → ${r.grade.corrected}. ${r.grade.explanation}`),
      retryExercise: history[0]?.rating < 2 && (!phrase.lastReviewedAt || history[0].ratedAt.getTime() >= phrase.lastReviewedAt.getTime()) ? history[0].exercise : undefined,
    });
  }
  return {
    sources: selectFoundations(sources.filter(s => s.prompt.trim() && s.target.trim()), mix, Math.max(6, Math.min(12, settings.dailyTarget)), now),
    activeTenses: settings.activeTenses,
    history: previous.slice(0, 60).map(r => ({ prompt: r.exercise.prompt, target: r.exercise.target })),
  };
}
