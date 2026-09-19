import { z } from "zod";
import type { FoundationsSource } from "./types";
import { foundationsWordLimit, isFoundationsSource, isSimpleFoundationsFrench, wordCount } from "./level";

export const phraseKey = (value: string) => value.normalize("NFC").toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Recall the saved expression itself so its rating still measures the same skill. */
export function requiredChunk(source: FoundationsSource): string | null {
  return isSimpleFoundationsFrench(source.target) ? source.target : null;
}

export function foundationsExerciseSchema(source: FoundationsSource, history: Array<{ prompt: string; target: string }>) {
  return z.object({
    sourceKey: z.literal(source.key),
    prompt: z.string().trim().min(3).max(180),
    target: z.string().trim().min(1).max(160),
    rubric: z.string().trim().min(4).max(700),
  }).superRefine((value, context) => {
    const prompt = phraseKey(value.prompt), target = phraseKey(value.target);
    if (!isFoundationsSource(source)) context.addIssue({ code: "custom", message: "Only short A1 or A2 source expressions belong in Foundations." });
    if (!isSimpleFoundationsFrench(value.target)) context.addIssue({ code: "custom", message: "Use a single simple phrase of at most six words, without object en/y, stacked pronouns, reflexive compound tenses or linked clauses." });
    if (wordCount(value.target) > foundationsWordLimit(source)) context.addIssue({ code: "custom", message: "Keep struggling words to four words; a longer source may only keep its existing length." });
    if (!/^Translate:\s*\S/i.test(value.prompt) || wordCount(value.prompt) > 12) context.addIssue({ code: "custom", message: "Use Translate: followed by a short English phrase, without a story." });
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
