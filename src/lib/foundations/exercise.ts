import { z } from "zod";
import type { FoundationsSource } from "./types";

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
    prompt: z.string().trim().min(8).max(500),
    target: z.string().trim().min(8).max(500),
    rubric: z.string().trim().min(4).max(700),
  }).superRefine((value, context) => {
    const prompt = phraseKey(value.prompt), target = phraseKey(value.target);
    const words = target.split(/\s+/);
    if (words.length < 4 || words.length > 35) context.addIssue({ code: "custom", message: "Give a short full sentence, not an isolated word or a paragraph." });
    if (history.concat(source).some(old => phraseKey(old.prompt) === prompt || phraseKey(old.target) === target)) {
      context.addIssue({ code: "custom", message: "Use a fresh sentence and context." });
    }
    if (` ${prompt} `.includes(` ${target} `)) context.addIssue({ code: "custom", message: "Do not reveal the answer in the prompt." });
    const chunk = requiredChunk(source);
    if (chunk && !` ${target} `.includes(` ${phraseKey(chunk)} `)) {
      context.addIssue({ code: "custom", message: "Use the source word or short expression itself in the sentence." });
    }
    const core = phraseKey(source.target);
    if (core.split(/\s+/).length >= 5 && ` ${target} `.includes(` ${core} `)) {
      context.addIssue({ code: "custom", message: "Change the situation, not just add a prefix or suffix to the source sentence." });
    }
  });
}
