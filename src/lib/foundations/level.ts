import type { LearningItem } from "@/lib/db/schema";

// Version 1 allowed advanced lesson sources and A2 sentence generation.
// Old rounds/retries must not bypass the beginner limits after this change.
export const FOUNDATIONS_VERSION = 2;
export const FOUNDATIONS_MAX_WORDS = 8;
export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** Foundations recalls the basic expression; longer tutor examples belong to other modes. */
export function foundationsCard(item: Pick<LearningItem, "french" | "english">) {
  return { promptEn: item.english.trim(), targetFr: item.french.trim() };
}

export function isFoundationsSource(source: { level: string; target: string; prompt: string }): boolean {
  return source.level.trim().toUpperCase() === "A1"
    && wordCount(source.target) > 0 && wordCount(source.target) <= FOUNDATIONS_MAX_WORDS
    && wordCount(source.prompt) > 0 && wordCount(source.prompt) <= 24;
}
