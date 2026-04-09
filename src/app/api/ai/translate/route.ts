// POST /api/ai/translate
// { text: string, direction?: "en2fr" | "fr2en" }
// Quick translate using GPT-5-mini. Returns { translation, notes }.

import { NextRequest } from "next/server";
import { z } from "zod";
import { chatJSON } from "@/lib/openai";
import { jsonError, jsonOk } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const Body = z.object({
  text: z.string().min(1).max(500),
  direction: z.enum(["en2fr", "fr2en"]).default("en2fr"),
});

const TranslationSchema = z.object({
  translation: z.string(),
  notes: z.string(),
});

const TranslationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["translation", "notes"],
  properties: {
    translation: { type: "string" },
    notes: { type: "string" },
  },
} as const;

export async function POST(req: NextRequest) {
  const rl = rateLimit("ai_translate", 60, 60_000);
  if (!rl.allowed) return jsonError("Too many requests. Slow down.", 429);

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return jsonError(
      `Invalid body: ${err instanceof Error ? err.message : String(err)}`,
      400
    );
  }

  const isToFrench = body.direction === "en2fr";
  const system = isToFrench
    ? "You are a French tutor for an A1-A2 English speaker. Translate the given English text to natural French. In 'notes', give a very short (1 sentence) tip about register, grammar, or vocabulary — something the learner would find useful. Keep it friendly and brief."
    : "You are a French tutor for an A1-A2 English speaker. Translate the given French text to English. In 'notes', give a very short (1 sentence) tip about what makes this phrase interesting grammatically or culturally. Keep it brief.";

  try {
    const result = await chatJSON({
      system,
      user: body.text,
      schema: TranslationSchema,
      schemaName: "translation",
      jsonSchema: TranslationJsonSchema as Record<string, unknown>,
      temperature: 0.3,
    });
    return jsonOk({
      translation: result.translation,
      notes: result.notes,
      direction: body.direction,
    });
  } catch (err) {
    console.error("Translate error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError(`Translation failed: ${msg}`, 502);
  }
}
