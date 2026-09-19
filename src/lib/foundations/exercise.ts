import { z } from "zod";
import type { FoundationsSource } from "./types";
import { isFoundationsSource } from "./level";

export const phraseKey = (value: string) => value.normalize("NFC").toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Keep both sides of the recall card fixed; an AI may explain it, but cannot expand it. */
export function foundationsRecall(source: Pick<FoundationsSource, "prompt" | "target">) {
  const cue = source.prompt.trim().replace(/^(?:Translate|Write in French):\s*/i, "");
  return {
    prompt: /^Fill the blank:/i.test(cue) ? cue : `Translate: ${cue}`,
    target: source.target.trim(),
  };
}

export function foundationsExerciseSchema(source: FoundationsSource) {
  const recall = foundationsRecall(source);
  return z.object({
    sourceKey: z.literal(source.key),
    prompt: z.string().trim().min(3).max(500),
    target: z.string().trim().min(1).max(160),
    rubric: z.string().trim().min(4).max(700),
  }).superRefine((value, context) => {
    const prompt = phraseKey(value.prompt), target = phraseKey(value.target);
    if (!isFoundationsSource(source)) context.addIssue({ code: "custom", message: "Only short A1 or A2 source expressions belong in Foundations." });
    if (target !== phraseKey(recall.target)) context.addIssue({ code: "custom", message: "Recall only the saved French expression, without added words or a surrounding sentence." });
    if (prompt !== phraseKey(recall.prompt)) context.addIssue({ code: "custom", message: "Use the saved English cue without adding a new task or context." });
  });
}
