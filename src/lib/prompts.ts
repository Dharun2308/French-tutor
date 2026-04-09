// AI prompts + zod schemas + raw JSON schemas for strict mode.
//
// The sentence builder is the signature feature of this tutor: for any
// (verb, tense), GPT-5 produces three variants of a sentence — formal,
// neutral, informal — and explains the register shift. The grader is used
// by the sentence mode to evaluate free-text answers and feed a rating
// back into the SRS system.

import { z } from "zod";
import { TENSE_LABELS, type Tense } from "@/types";

// ====================================================================
// 1) Sentence exercise generator
// ====================================================================

export const SentenceExerciseSchema = z.object({
  prompt_en: z
    .string()
    .describe("A short English sentence the user should translate."),
  formal: z
    .string()
    .describe(
      "Formal French translation using vous and polite phrasing where applicable."
    ),
  neutral: z
    .string()
    .describe("Neutral French — the standard textbook version."),
  informal: z
    .string()
    .describe(
      "Casual/informal French using tu, contractions, and relaxed phrasing."
    ),
  notes: z
    .string()
    .describe(
      "1-3 short bullet points explaining the register differences, separated by newlines."
    ),
});

export type SentenceExercise = z.infer<typeof SentenceExerciseSchema>;

export const SentenceExerciseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["prompt_en", "formal", "neutral", "informal", "notes"],
  properties: {
    prompt_en: { type: "string" },
    formal: { type: "string" },
    neutral: { type: "string" },
    informal: { type: "string" },
    notes: { type: "string" },
  },
} as const;

export function sentenceSystemPrompt(): string {
  return [
    "You are a helpful French tutor for English speakers.",
    "Your job is to generate a single short practice sentence and render it in three registers: formal, neutral, informal.",
    "Constraints:",
    "- Use the TARGET verb and TARGET tense the user specifies.",
    "- Keep sentences short (5-12 words). Prefer A1/A2 vocabulary.",
    "- The English prompt should be natural and not mirror French word order.",
    "- The formal version should use 'vous' and polite register (e.g. 'je voudrais', 'pourriez-vous').",
    "- The neutral version is the standard textbook version — use 'tu' for singular addressee unless the context is plural/formal.",
    "- The informal version uses 'tu', may drop 'ne' in negation, use contractions ('t'as', 'j'sais pas') when natural.",
    "- In the notes field, give 1–3 bullet points explaining the key register differences in this sentence. Use plain English. Separate bullets with newlines.",
    "- Never explain grammar the user already knows; focus on register choices.",
  ].join("\n");
}

export function sentenceUserPrompt(args: {
  infinitive: string;
  english: string;
  tense: Tense;
  theme?: string;
}): string {
  const tenseLabel = TENSE_LABELS[args.tense];
  const theme = args.theme ? ` Theme: ${args.theme}.` : "";
  return `Generate an exercise for the verb "${args.infinitive}" (${args.english}) in the ${tenseLabel} tense.${theme}`;
}

// ====================================================================
// 2) Free-text answer grader
// ====================================================================

export const GradeResultSchema = z.object({
  verdict: z.enum(["correct", "minor", "major", "wrong"]),
  error_type: z.enum([
    "none",
    "typo",
    "accent",
    "conjugation",
    "tense",
    "agreement",
    "word_order",
    "vocabulary",
    "register",
    "other",
  ]),
  corrected: z
    .string()
    .describe(
      "The corrected French sentence. If the answer is fully correct, echo it back."
    ),
  explanation: z
    .string()
    .describe(
      "A friendly 1-3 sentence explanation in English of what was right/wrong."
    ),
});

export type GradeResult = z.infer<typeof GradeResultSchema>;

export const GradeResultJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "error_type", "corrected", "explanation"],
  properties: {
    verdict: {
      type: "string",
      enum: ["correct", "minor", "major", "wrong"],
    },
    error_type: {
      type: "string",
      enum: [
        "none",
        "typo",
        "accent",
        "conjugation",
        "tense",
        "agreement",
        "word_order",
        "vocabulary",
        "register",
        "other",
      ],
    },
    corrected: { type: "string" },
    explanation: { type: "string" },
  },
} as const;

export function gradeSystemPrompt(): string {
  return [
    "You are a precise but kind French teacher grading a learner's free-text answer.",
    "Verdict scale:",
    "- correct: fully right, or indistinguishable from a native-acceptable form.",
    "- minor: a typo or missing accent that doesn't change the tense or meaning.",
    "- major: a real grammar or conjugation error, wrong tense, or wrong verb.",
    "- wrong: incomprehensible or entirely off-target.",
    "Rules:",
    "- If the user typed a present-tense form where the target is a past tense, this is 'tense' / 'major', not 'typo'.",
    "- If the user dropped an accent but the word is still unambiguous, use 'accent' / 'minor'.",
    "- 'corrected' should be the fully correct target sentence. Echo the user's answer if correct.",
    "- 'explanation' should be 1-3 short sentences, friendly, in English, focused on the most useful feedback.",
    "- Do NOT output markdown formatting, just plain text in the explanation.",
  ].join("\n");
}

export function gradeUserPrompt(args: {
  target: string; // The canonical correct sentence
  attempt: string; // What the user typed
  infinitive: string;
  tense: Tense;
}): string {
  return [
    `Target verb: "${args.infinitive}" in the ${TENSE_LABELS[args.tense]} tense.`,
    `Expected (a canonical correct answer): "${args.target}"`,
    `Learner's answer: "${args.attempt}"`,
    "Grade the learner's answer. Other valid variants (different phrasing, register shifts) should still count as correct if the grammar and tense are right.",
  ].join("\n");
}

// ====================================================================
// 3) Explanation generator (for "explain this conjugation / nuance")
// ====================================================================

export const ExplanationSchema = z.object({
  summary: z.string().describe("One-sentence summary."),
  details: z.string().describe("2-5 sentences of friendly explanation."),
  examples: z.array(z.string()).max(4),
});

export type Explanation = z.infer<typeof ExplanationSchema>;

export const ExplanationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "details", "examples"],
  properties: {
    summary: { type: "string" },
    details: { type: "string" },
    examples: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

export function explainSystemPrompt(): string {
  return [
    "You are a French grammar tutor for English speakers.",
    "Given a question about a conjugation, tense, or register nuance, answer in plain, friendly English.",
    "Keep it short. Give 1-4 concrete examples with literal English gloss where helpful.",
  ].join("\n");
}
