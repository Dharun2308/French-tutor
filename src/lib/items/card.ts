// What a review card shows and expects for a learning item. Server-side so
// the grader and the queue can never disagree about the target.
//
// Production-first: the learner sees English and types French. When the item
// carries a tutor example, the example sentence is the card (that is the
// phrase in real use); otherwise the bare chunk is.

import type { LearningItem } from "@/lib/db/schema";

export type CardMode = "example" | "phrase";

export interface CardFace {
  mode: CardMode;
  promptEn: string;
  targetFr: string;
}

export function cardFor(
  item: Pick<LearningItem, "french" | "english" | "exampleFr" | "exampleEn">
): CardFace {
  const hasExample = item.exampleFr.trim().length > 0 && item.exampleEn.trim().length > 0;
  if (hasExample) {
    return { mode: "example", promptEn: item.exampleEn.trim(), targetFr: item.exampleFr.trim() };
  }
  return { mode: "phrase", promptEn: item.english.trim(), targetFr: item.french.trim() };
}
