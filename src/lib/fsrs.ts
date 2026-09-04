// FSRS scheduling for learning_items — a thin wrapper around ts-fsrs so the
// library's types never leak past this file. SM-2 in srs.ts still schedules
// verbs and phrases; this is only for lesson items.

import {
  createEmptyCard,
  fsrs,
  Rating as FsrsRating,
  State,
  type Card,
  type Grade,
} from "ts-fsrs";
import type { Rating } from "@/types";

/** The FSRS columns on a learning_items row. */
export interface ItemSrs {
  fsrsState: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  dueAt: Date;
  lastReviewedAt: Date | null;
}

// Defaults: request_retention 0.9, fuzz on so due dates spread out.
const scheduler = fsrs({ enable_fuzz: true, enable_short_term: true });

export function toCard(s: ItemSrs): Card {
  return {
    due: s.dueAt,
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsedDays,
    scheduled_days: s.scheduledDays,
    learning_steps: s.learningSteps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.fsrsState as State,
    last_review: s.lastReviewedAt ?? undefined,
  };
}

export function fromCard(c: Card): ItemSrs {
  return {
    fsrsState: c.state,
    stability: c.stability,
    difficulty: c.difficulty,
    elapsedDays: c.elapsed_days,
    scheduledDays: c.scheduled_days,
    learningSteps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    dueAt: c.due,
    lastReviewedAt: c.last_review ?? null,
  };
}

/** RateButtons scale (0 Again … 3 Easy) → FSRS grade. */
export function ratingToGrade(r: Rating): Grade {
  return [FsrsRating.Again, FsrsRating.Hard, FsrsRating.Good, FsrsRating.Easy][r] as Grade;
}

/** Apply a rating and return the next FSRS state. Pure. */
export function applyItemRating(s: ItemSrs, rating: Rating, now: Date = new Date()): ItemSrs {
  const card = s.fsrsState === State.New && s.reps === 0 ? createEmptyCard(now) : toCard(s);
  const { card: next } = scheduler.next(card, now, ratingToGrade(rating));
  return fromCard(next);
}

/**
 * Listening is recognition evidence, so it never advances the production
 * schedule. A successful dictation leaves the FSRS card untouched; a failed
 * one (Again or Hard) pulls the item forward so the next session tests it in
 * production. Pure.
 */
export function applyListeningRating(s: ItemSrs, rating: Rating, now: Date = new Date()): ItemSrs {
  if (rating >= 2) return { ...s };
  return { ...s, dueAt: s.dueAt.getTime() <= now.getTime() ? s.dueAt : now };
}

/** Probability (0..1) of recalling the item right now. 0 for never-reviewed items. */
export function retrievability(s: ItemSrs, now: Date = new Date()): number {
  if (s.fsrsState === State.New || s.reps === 0) return 0;
  const r = scheduler.get_retrievability(toCard(s), now, false);
  return typeof r === "number" ? r : 0;
}

export const FSRS_STATE_LABELS: Record<number, string> = {
  [State.New]: "New",
  [State.Learning]: "Learning",
  [State.Review]: "Review",
  [State.Relearning]: "Relearning",
};
