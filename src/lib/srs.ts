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
    intervalDays = 1;
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

  const nextReviewAt = new Date(now.getTime() + intervalDays * MS_PER_DAY);

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

/**
 * Return the start of "today" in the given IANA timezone, as a UTC Date.
 * Used when we want `next_review_at <= now` but anchored to the user's day,
 * e.g. counting cards "due today".
 */
export function startOfUserDay(now: Date, timezone: string): Date {
  try {
    // Format the given instant in the user's timezone, then rebuild.
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const y = get("year");
    const m = get("month");
    const d = get("day");
    // Build a UTC date at the user's local midnight.
    // Example: if user is at 2026-04-08 10:00 LA time,
    // startOfUserDay returns the UTC instant of 2026-04-08 00:00 LA time.
    const isoLocal = `${y}-${m}-${d}T00:00:00`;
    // Convert local-at-TZ-midnight to UTC by using the timezone offset of that moment.
    return new Date(
      new Date(isoLocal).getTime() - offsetForZone(timezone, isoLocal)
    );
  } catch {
    // Fallback: UTC midnight.
    const utc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    return utc;
  }
}

function offsetForZone(timezone: string, isoLocal: string): number {
  // Compute the timezone's offset (ms) for the given local wall-clock time.
  const d = new Date(isoLocal);
  const localStr = d.toLocaleString("en-US", { timeZone: timezone });
  const local = new Date(localStr);
  return local.getTime() - d.getTime();
}
