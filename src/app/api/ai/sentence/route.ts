// POST /api/ai/sentence
// { verbId: number, tense: Tense, theme?: string }
// Generates a sentence exercise with formal/neutral/informal variants.
// Caches by (verbId, tense, promptHash) so repeat calls are free.

import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { sentenceExamples, verbs } from "@/lib/db/schema";
import { chatJSON } from "@/lib/openai";
import {
  SentenceExerciseSchema,
  SentenceExerciseJsonSchema,
  sentenceSystemPrompt,
  sentenceUserPrompt,
} from "@/lib/prompts";
import { quickHash } from "@/lib/normalize";
import { jsonError, jsonOk } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { PERSONS, TENSES, type Tense, type Person } from "@/types";

export const runtime = "nodejs";

const Body = z.object({
  verbId: z.number().int().positive(),
  tense: z.enum(TENSES),
  // The grammatical subject to build the sentence around. Defaults to "je"
  // for older callers, but the practice UI always sends the due card's person
  // so the graded sentence matches the card being updated.
  person: z.enum(PERSONS).optional(),
  theme: z.string().max(60).optional(),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit("ai_sentence", 30, 60_000);
  if (!rl.allowed) {
    return jsonError("Too many AI requests. Slow down a moment.", 429);
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return jsonError(
      `Invalid body: ${err instanceof Error ? err.message : String(err)}`,
      400
    );
  }

  const [verb] = await db
    .select()
    .from(verbs)
    .where(eq(verbs.id, body.verbId))
    .limit(1);
  if (!verb) return jsonError("Verb not found", 404);

  const person: Person = body.person ?? "1s";

  // Cache key: person + theme are part of the shape so different subjects and
  // themed prompts don't collide.
  const promptHash = quickHash(
    JSON.stringify({ tense: body.tense, person, theme: body.theme ?? null })
  );

  const cached = await db
    .select()
    .from(sentenceExamples)
    .where(
      and(
        eq(sentenceExamples.verbId, verb.id),
        eq(sentenceExamples.tense, body.tense),
        eq(sentenceExamples.promptHash, promptHash)
      )
    )
    .limit(1);

  if (cached.length > 0) {
    const ex = cached[0];
    return jsonOk({
      cached: true,
      verb: { id: verb.id, infinitive: verb.infinitive, english: verb.english },
      tense: body.tense as Tense,
      prompt_en: ex.promptEn,
      formal: ex.formal,
      neutral: ex.neutral,
      informal: ex.informal,
      notes: ex.notes ?? "",
    });
  }

  let result;
  try {
    result = await chatJSON({
      system: sentenceSystemPrompt(),
      user: sentenceUserPrompt({
        infinitive: verb.infinitive,
        english: verb.english,
        tense: body.tense,
        person,
        theme: body.theme,
      }),
      schema: SentenceExerciseSchema,
      schemaName: "sentence_exercise",
      jsonSchema: SentenceExerciseJsonSchema as Record<string, unknown>,
    });
  } catch (err) {
    console.error("AI sentence error:", err);
    return jsonError("AI unavailable. Try again in a moment.", 502);
  }

  await db.insert(sentenceExamples).values({
    verbId: verb.id,
    tense: body.tense,
    promptHash,
    promptEn: result.prompt_en,
    formal: result.formal,
    neutral: result.neutral,
    informal: result.informal,
    notes: result.notes,
  });

  return jsonOk({
    cached: false,
    verb: { id: verb.id, infinitive: verb.infinitive, english: verb.english },
    tense: body.tense as Tense,
    prompt_en: result.prompt_en,
    formal: result.formal,
    neutral: result.neutral,
    informal: result.informal,
    notes: result.notes,
  });
}
