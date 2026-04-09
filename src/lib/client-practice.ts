// Shared client-side types and fetchers for the practice pages.

import { compareAnswer } from "@/lib/normalize";
import type { Rating, Tense, Person } from "@/types";
import { verdictToRating } from "@/lib/srs";

export interface PracticeCard {
  cardId: number;
  verbId: number;
  infinitive: string;
  english: string;
  group: string;
  level: string;
  auxiliary: string;
  tense: Tense;
  tenseLabel: string;
  person: Person;
  pronoun: string;
  form: string;
  isIrregular: boolean;
  repetitions: number;
  options?: string[]; // only present in multiple_choice mode
}

export async function fetchNextCards(
  mode: "drill" | "flashcards" | "multiple_choice",
  count = 10
): Promise<{ cards: PracticeCard[]; error?: string }> {
  try {
    const res = await fetch(
      `/api/cards/next?mode=${mode}&count=${count}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { cards: [], error: body.error ?? `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { cards: data.cards };
  } catch (err) {
    return { cards: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export async function submitReview(cardId: number, rating: Rating) {
  const res = await fetch("/api/cards/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cardId, rating }),
  });
  if (!res.ok) throw new Error(`review failed: ${res.status}`);
  return res.json();
}

/**
 * Self-grade for drill mode: compare client-side, return a rating.
 * - exact match → good (2), or easy (3) if already known
 * - accent-only typo → hard (1) with a gentle message
 * - otherwise → wrong (0)
 */
export function gradeDrill(
  user: string,
  target: string,
  repetitions: number
): { rating: Rating; feedback: "exact" | "accent-typo" | "wrong" } {
  const cmp = compareAnswer(user, target);
  if (cmp === "exact") {
    return { rating: repetitions >= 3 ? 3 : 2, feedback: "exact" };
  }
  if (cmp === "accent-typo") {
    return { rating: 1, feedback: "accent-typo" };
  }
  return { rating: 0, feedback: "wrong" };
}

export { verdictToRating };
