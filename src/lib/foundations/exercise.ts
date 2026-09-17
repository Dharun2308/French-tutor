import { z } from "zod";
import type { FoundationsSource } from "./types";
import { FOUNDATIONS_MAX_WORDS, isFoundationsSource, wordCount } from "./level";

export const phraseKey = (value: string) => value.normalize("NFC").toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Keep a short word/expression itself in the new sentence, not merely a related rule. */
export function requiredChunk(source: FoundationsSource): string | null {
  const words = phraseKey(source.target).split(/\s+/);
  // Variant lists and teaching annotations are not a single phrase to quote.
  return words.length <= 4 && !/[\/();\n_…]|\.\./.test(source.target) ? source.target : null;
}

export function foundationsExerciseSchema(source: FoundationsSource, history: Array<{ prompt: string; target: string }>) {
  return z.object({
    sourceKey: z.literal(source.key),
    prompt: z.string().trim().min(3).max(180),
    target: z.string().trim().min(1).max(160),
    rubric: z.string().trim().min(4).max(700),
  }).superRefine((value, context) => {
    const prompt = phraseKey(value.prompt), target = phraseKey(value.target);
    if (!isFoundationsSource(source)) context.addIssue({ code: "custom", message: "Only short A1 source expressions belong in Foundations." });
    if (wordCount(value.target) > FOUNDATIONS_MAX_WORDS) context.addIssue({ code: "custom", message: "Use at most eight French words for beginner recall." });
    if (!/^Translate:\s*\S/i.test(value.prompt) || wordCount(value.prompt) > 20) context.addIssue({ code: "custom", message: "Use Translate: followed by a short English phrase, without a story." });
    if (history.some(old => phraseKey(old.prompt) === prompt && phraseKey(old.target) === target)) {
      context.addIssue({ code: "custom", message: "Use a small beginner variation of this prompt/answer pair." });
    }
    if (` ${prompt} `.includes(` ${target} `)) context.addIssue({ code: "custom", message: "Do not reveal the answer in the prompt." });
    const chunk = requiredChunk(source);
    if (chunk && !` ${target} `.includes(` ${phraseKey(chunk)} `)) {
      context.addIssue({ code: "custom", message: "Use the source word or short expression itself in the sentence." });
    }
  });
}
