// Notebook → learning items. Zod schema + strict JSON schema + prompts,
// mirroring the trio pattern in lib/prompts.ts.
//
// The wire schema is deliberately lenient on numbers (clamped, not rejected)
// because a model that returns priority 6 on an otherwise perfect extraction
// should not cost the user a 40-second retry. The commit route enforces the
// strict ranges on what the user actually saves.

import { z } from "zod";
import { LEARNING_ITEM_TYPES, ITEM_CEFR_LEVELS } from "@/types";

const clamp = (lo: number, hi: number) => (n: number) =>
  Math.min(hi, Math.max(lo, n));

export const ExtractedItemSchema = z.object({
  french: z.string().min(1),
  english: z.string(),
  example_fr: z.string(),
  example_en: z.string(),
  type: z.enum(LEARNING_ITEM_TYPES),
  grammar_topic: z.string(),
  cefr_level: z.enum(ITEM_CEFR_LEVELS),
  priority: z.number().transform((n) => clamp(1, 5)(Math.round(n))),
  confidence: z.number().transform(clamp(0, 1)),
  source_context: z.string(),
  // "" when legible; otherwise what was ambiguous ("could be manger or mangé").
  handwriting_note: z.string(),
});
export type ExtractedItem = z.infer<typeof ExtractedItemSchema>;

export const ExtractionSchema = z.object({
  lesson_summary: z.string(),
  items: z.array(ExtractedItemSchema).max(25),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

export const ExtractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["lesson_summary", "items"],
  properties: {
    lesson_summary: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "french",
          "english",
          "example_fr",
          "example_en",
          "type",
          "grammar_topic",
          "cefr_level",
          "priority",
          "confidence",
          "source_context",
          "handwriting_note",
        ],
        properties: {
          french: { type: "string" },
          english: { type: "string" },
          example_fr: { type: "string" },
          example_en: { type: "string" },
          type: { type: "string", enum: [...LEARNING_ITEM_TYPES] },
          grammar_topic: { type: "string" },
          cefr_level: { type: "string", enum: [...ITEM_CEFR_LEVELS] },
          priority: { type: "integer" },
          confidence: { type: "number" },
          source_context: { type: "string" },
          handwriting_note: { type: "string" },
        },
      },
    },
  },
} as const;

export function extractionSystemPrompt(): string {
  return [
    "You extract learning items from a French learner's lesson notes: photos of a handwritten notebook and/or pasted text.",
    "",
    "Learner: English speaker, CEFR A2 (Alliance Française A2.2), studies 2–3 h/day with frequent iTalki conversation lessons. The goal is SPOKEN PRODUCTION in real conversations (long-term: TCF Canada). Listening is the weakest skill.",
    "",
    "Return the 5–15 highest-value items for this lesson. Fewer if the notes are short. Never pad.",
    "",
    "Rules, in priority order:",
    "1. Tutor corrections come first. A crossed-out or arrowed form next to a fixed one (\"à le restaurant → au restaurant\"), a margin note, \"non:\", or \"pas X mais Y\" is a correction. type=\"correction\", priority=5, french=the CORRECT form, source_context=the mistake exactly as written.",
    "2. Prefer chunks the learner can say in conversation (\"j'ai besoin de…\", \"ça dépend\", \"pas encore\") over isolated words. type=\"phrase\".",
    "3. Keep an isolated word only if it is useful in speech, and give it a natural A2-level sentence in example_fr / example_en so it is learned in context. type=\"vocabulary\".",
    "4. A grammar rule written out AS A RULE (not as an example phrase) is type=\"grammar\" with grammar_topic set (\"passé composé\", \"negation\", \"à + le → au\"). Keep these rare — phrases beat rules.",
    "5. Pronunciation notes (liaison marks, IPA, \"the t is silent\") are type=\"pronunciation\".",
    "6. Skip what an A2 learner already knows (basic greetings, numbers, \"je suis\") unless the notes show it as a repeated mistake.",
    "7. Preserve exactly what the tutor wrote. Do not improve their French. Fix only an obvious learner spelling slip, and say so in source_context.",
    "8. If handwriting is unclear, do NOT guess a plausible word. Put your best reading in french, set confidence ≤ 0.6, and describe the ambiguity in handwriting_note (\"could be 'manger' or 'mangé'\"). handwriting_note is \"\" when the text is legible.",
    "9. Every item gets an example_fr / example_en pair. If the notes already contain a sentence using the item, use that — it is the tutor's. Otherwise write one at the learner's level.",
    "10. english is a natural translation, not word-for-word. For phrases, translate the whole chunk.",
    "11. priority: 5 = tutor correction · 4 = very useful conversational phrase · 3 = useful · 2 = nice-to-have · 1 = marginal. confidence = how sure you are that `french` is what the notes say (not how useful it is).",
    "12. cefr_level is the level of the item itself (A1–B2). grammar_topic is \"\" unless the item is clearly about one grammar point.",
    "13. lesson_summary: one short line describing what the lesson covered (\"Restaurant vocab + passé composé corrections\"). It becomes the import's label.",
    "14. Do not invent items that are not in the notes. If the same item appears twice, return it once.",
    "15. Plain text in every field. No markdown, no quotes around whole values.",
  ].join("\n");
}

export function extractionUserPrompt(args: {
  imageCount: number;
  text?: string;
  note?: string;
}): string {
  const parts: string[] = [];
  if (args.imageCount > 0) {
    parts.push(
      `Attached: ${args.imageCount} photo${args.imageCount === 1 ? "" : "s"} of my notebook from one lesson.`
    );
  }
  if (args.text && args.text.trim()) {
    parts.push("Pasted notes:\n---\n" + args.text.trim() + "\n---");
  }
  if (args.note && args.note.trim()) {
    parts.push("Context from me: " + args.note.trim());
  }
  parts.push("Extract the learning items.");
  return parts.join("\n\n");
}
