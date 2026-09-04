// Grading a typed French answer for a lesson item. Same zod + JSON-schema +
// prompt trio as lib/prompts.ts, but not bound to a verb/tense — the target
// is whatever sentence or chunk the item carries.

import { z } from "zod";
import { ITEM_ERROR_TYPES, ITEM_VERDICTS } from "@/types";

export const GradeItemSchema = z.object({
  verdict: z.enum(ITEM_VERDICTS),
  error_type: z.enum(ITEM_ERROR_TYPES),
  corrected: z.string(),
  reason: z.string(),
});
export type GradeItemResult = z.infer<typeof GradeItemSchema>;

export const GradeItemJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "error_type", "corrected", "reason"],
  properties: {
    verdict: { type: "string", enum: [...ITEM_VERDICTS] },
    error_type: {
      type: "string",
      enum: [...ITEM_ERROR_TYPES],
    },
    corrected: { type: "string" },
    reason: { type: "string" },
  },
} as const;

export function gradeItemSystemPrompt(direction: "production" | "recognition" | "listening" = "production"): string {
  const task = direction === "listening"
    ? "The learner heard a French recording and is transcribing exactly what they heard. Do not accept a paraphrase with similar meaning as CORRECT; grade the dictated words, grammar, and accents."
    : "The learner is producing French from an English prompt. A fully natural equivalent phrasing may be correct if it preserves the target meaning.";
  return [
    `You are a precise but kind French teacher grading an A2 learner's typed answer. ${task}`,
    "Verdicts:",
    "- CORRECT: right, or a different phrasing that is fully correct and uses the target phrase (or an equally natural one).",
    "- ACCEPTABLE: understandable and grammatical with a small slip that a native speaker would barely notice (one typo, missing punctuation, minor word choice).",
    "- MINOR_ERROR: one real but small mistake — a missing accent that changes the form (manger/mangé), a wrong article or preposition (à le → au), an agreement slip, a misplaced ne…pas.",
    "- WRONG: wrong tense or verb, wrong meaning, missing the target structure, or incomprehensible.",
    "Rules:",
    "- Never mark an answer WRONG only because of accents, capitalisation or punctuation.",
    "- corrected = the best fully correct version of what the learner was trying to say. If already correct, echo the learner's answer.",
    "- reason = 1–2 short plain-English sentences naming the single most useful thing. Plain text, no markdown.",
    "- error_type = the main error category, or none.",
  ].join("\n");
}

export function gradeItemUserPrompt(args: {
  french: string;
  english: string;
  target: string;
  promptEn: string;
  attempt: string;
}): string {
  return [
    `Target phrase: "${args.french}" (${args.english})`,
    `English prompt shown to the learner: "${args.promptEn}"`,
    `A correct answer: "${args.target}"`,
    `Learner's answer: "${args.attempt}"`,
    "Grade the learner's answer.",
  ].join("\n");
}
