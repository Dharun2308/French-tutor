import type { Rating } from "@/types";
import { applyRating, type SrsState } from "@/lib/srs";
import { isFoundationsSource } from "./level";
import type { Challenge, FoundationsData, FoundationsMix, FoundationsSource, RecallMemory } from "./types";

export function recallMemory(reviews: { rating: Rating; ratedAt: Date }[]): RecallMemory {
  const ordered = [...reviews].sort((a, b) => b.ratedAt.getTime() - a.ratedAt.getTime());
  return {
    again: ordered.filter(r => r.rating === 0).length,
    hard: ordered.filter(r => r.rating === 1).length,
    good: ordered.filter(r => r.rating === 2).length,
    easy: ordered.filter(r => r.rating === 3).length,
    recentStruggles: ordered.slice(0, 5).filter(r => r.rating < 2).length,
    lastRating: ordered[0]?.rating ?? null,
  };
}

export function challengeFor(memory: RecallMemory, historicalMisses: number): Challenge {
  if (memory.recentStruggles >= 2 || (memory.lastRating === null && historicalMisses >= 2)) return "supported";
  if (!memory.recentStruggles && memory.easy >= 2) return "stretch";
  return "standard";
}

/** Struggles lead, due reviews follow, and a limited fresh pool keeps practice varied. */
export function selectFoundations(candidates: FoundationsSource[], mix: FoundationsMix, target = 12, now = new Date()) {
  const pool = candidates.filter(c => isFoundationsSource(c) && Date.parse(c.dueAt) <= now.getTime() && (mix === "blend" || (mix === "notes" ? c.kind === "personal" : c.kind === "phrase")))
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  const selected: FoundationsSource[] = [];
  const used = new Set<string>();
  const textUsed = new Set<string>();
  const noteCount = pool.filter(c => c.kind === "personal").length;
  const everydayCount = pool.length - noteCount;
  const limits = mix === "blend" ? {
    personal: Math.min(noteCount, Math.max(Math.ceil(target / 2), target - everydayCount)),
    phrase: Math.min(everydayCount, Math.max(Math.floor(target / 2), target - noteCount)),
  } : { personal: target, phrase: target };
  const add = (source: FoundationsSource, overflow = false) => {
    const text = source.target.normalize("NFC").trim().toLowerCase();
    if (selected.length >= target || used.has(source.key) || textUsed.has(text)) return false;
    if (!overflow && selected.filter(s => s.kind === source.kind).length >= limits[source.kind]) return false;
    selected.push(source); used.add(source.key); textUsed.add(text); return true;
  };
  // An Again card still has review evidence even though SM-2 resets repetitions to zero.
  for (const source of pool.filter(c => c.memory.recentStruggles > 0 || c.memory.lastRating === 0 || c.memory.lastRating === 1 || c.challenge === "supported")) {
    if (selected.length >= Math.ceil(target / 2)) break;
    add(source);
  }
  for (const reviewed of [true, false]) {
    const notes = pool.filter(c => c.reviewed === reviewed && c.kind === "personal");
    const everyday = pool.filter(c => c.reviewed === reviewed && c.kind === "phrase");
    for (let i = 0; i < Math.max(notes.length, everyday.length); i++) {
      if (everyday[i]) add(everyday[i]);
      if (notes[i]) add(notes[i]);
      if (selected.length >= target) return selected;
    }
  }
  // Duplicate expressions across origins must not leave an otherwise useful round short.
  for (const source of pool) add(source, true);
  return selected;
}

/** Distinct first-review intervals, with short recovery steps for persistent misses. */
export function foundationsSchedule(state: SrsState, rating: Rating, recentStruggles = 0, now = new Date()): SrsState {
  const next = applyRating(state, rating, now);
  if (rating === 0) return next;
  let intervalMs = next.intervalDays * 86_400_000;
  if (rating === 1) intervalMs = state.intervalDays === 0 || recentStruggles >= 2 ? 30 * 60_000 : Math.min(86_400_000, intervalMs);
  if (rating === 2 && recentStruggles >= 2) intervalMs = Math.min(intervalMs, 86_400_000);
  if (rating === 3) intervalMs = Math.max(4 * 86_400_000, intervalMs);
  return { ...next, repetitions: rating === 1 ? state.repetitions : next.repetitions, intervalDays: Math.floor(intervalMs / 86_400_000), nextReviewAt: new Date(now.getTime() + intervalMs) };
}

export function reinforce(data: FoundationsData, questionId: string, newId: string): boolean {
  const index = data.queue.findIndex(q => q.id === questionId);
  const question = data.queue[index];
  if (!question?.feedback || question.feedback.rating === null || question.feedback.rating >= 2 || question.followUp) return false;
  if (data.queue.filter(q => q.followUp).length >= 3 || data.queue.some(q => q.followUp && q.sourceKey === question.sourceKey)) return false;
  data.queue.splice(Math.min(index + 3, data.queue.length), 0, {
    id: newId, sourceKey: question.sourceKey, followUp: true, exercise: question.exercise,
  });
  return true;
}
