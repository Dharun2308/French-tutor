// SM-2 spaced repetition. All functions are pure so they're trivial to reason about.
//
// The ease factor is stored in the DB as an integer (×100) to avoid SQLite float
// quirks, so we accept/return `easeX100` at the boundaries.

import type { Rating, Verdict } from "@/types";

export interface SrsState {
  easeX100: number; // 130..400 roughly
  intervalDays: number;
  repetitions: number;
  nextReviewAt: Date;
  lastReviewedAt: Date | null;
}

const MIN_EASE_X100 = 130;
const DEFAULT_EASE_X100 = 250;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// A failed card comes back after a short relearn step (same session),
// not a full day — you relearn it while it's fresh.
const RELEARN_MS = 10 * 60 * 1000;

export function initialState(now: Date = new Date()): SrsState {
  return {
    easeX100: DEFAULT_EASE_X100,
    intervalDays: 0,
    repetitions: 0,
    nextReviewAt: now,
    lastReviewedAt: null,
  };
}

/**
 * Apply a rating to an SRS state and return the next state.
 * Rating scale: 0 Again, 1 Hard, 2 Good, 3 Easy.
 */
export function applyRating(
  state: SrsState,
  rating: Rating,
  now: Date = new Date()
): SrsState {
  let { easeX100, intervalDays, repetitions } = state;

  if (rating === 0) {
    repetitions = 0;
    intervalDays = 0;
    easeX100 = Math.max(MIN_EASE_X100, easeX100 - 20);
  } else {
    const ease = easeX100 / 100;
    if (repetitions === 0) {
      intervalDays = 1;
    } else if (repetitions === 1) {
      intervalDays = 3;
    } else {
      if (rating === 1) {
        intervalDays = Math.max(1, Math.round(intervalDays * 1.2));
      } else if (rating === 2) {
        intervalDays = Math.max(1, Math.round(intervalDays * ease));
      } else {
        intervalDays = Math.max(1, Math.round(intervalDays * ease * 1.3));
      }
    }

    if (rating === 1) {
      easeX100 = Math.max(MIN_EASE_X100, easeX100 - 15);
    } else if (rating === 3) {
      easeX100 = easeX100 + 15;
    }
    repetitions += 1;
  }

  // cap silly intervals at 1 year
  if (intervalDays > 365) intervalDays = 365;

  const nextReviewAt =
    rating === 0
      ? new Date(now.getTime() + RELEARN_MS)
      : new Date(now.getTime() + intervalDays * MS_PER_DAY);

  return {
    easeX100,
    intervalDays,
    repetitions,
    nextReviewAt,
    lastReviewedAt: now,
  };
}

/**
 * Map a grader verdict (for the AI sentence builder) to an SRS rating.
 * The LLM may also return a "suggested_rating" but we override here so the
 * mapping is under our control.
 */
export function verdictToRating(verdict: Verdict): Rating {
  switch (verdict) {
    case "correct":
      return 3;
    case "minor":
      return 2;
    case "major":
      return 1;
    case "wrong":
      return 0;
  }
}
