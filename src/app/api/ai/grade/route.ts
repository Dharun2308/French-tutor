// POST /api/ai/grade
// { target: string, attempt: string, infinitive: string, tense: Tense, cardId?: number }
//
// Grades a free-text answer and returns a verdict plus an SRS rating.
// If `cardId` is provided, we ALSO apply the rating to the card's SRS state —
// this keeps the sentence builder as an effective driver for SRS spacing.
//
// The LLM returns a verdict + error_type; the rating mapping is server-side
// in TS (see srs.ts / verdictToRating) so the model can't put its thumb on
// the scale.

import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { cards } from "@/lib/db/schema";
import { chatJSON } from "@/lib/openai";
import {
  GradeResultSchema,
  GradeResultJsonSchema,
  gradeSystemPrompt,
  gradeUserPrompt,
} from "@/lib/prompts";
import { applyRating, verdictToRating } from "@/lib/srs";
import { jsonError, jsonOk } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { TENSES } from "@/types";

export const runtime = "nodejs";

const Body = z.object({
  target: z.string().min(1).max(400),
  attempt: z.string().min(1).max(400),
  infinitive: z.string().min(1).max(40),
  tense: z.enum(TENSES),
  cardId: z.number().int().positive().optional(),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit("ai_grade", 60, 60_000);
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

  let result;
  try {
    result = await chatJSON({
      system: gradeSystemPrompt(),
      user: gradeUserPrompt({
        target: body.target,
        attempt: body.attempt,
        infinitive: body.infinitive,
        tense: body.tense,
      }),
      schema: GradeResultSchema,
      schemaName: "grade_result",
      jsonSchema: GradeResultJsonSchema as Record<string, unknown>,
    });
  } catch (err) {
    console.error("AI grade error:", err);
    return jsonError("AI unavailable. Try again in a moment.", 502);
  }

  const rating = verdictToRating(result.verdict);

  // Optionally update the card SRS state.
  if (body.cardId) {
    const rows = await db
      .select()
      .from(cards)
      .where(eq(cards.id, body.cardId))
      .limit(1);
    if (rows.length > 0) {
      const card = rows[0];
      const next = applyRating(
        {
          easeX100: card.easeFactor,
          intervalDays: card.intervalDays,
          repetitions: card.repetitions,
          nextReviewAt: card.nextReviewAt,
          lastReviewedAt: card.lastReviewedAt ?? null,
        },
        rating
      );
      const correct = rating >= 2;
      await db
        .update(cards)
        .set({
          easeFactor: next.easeX100,
          intervalDays: next.intervalDays,
          repetitions: next.repetitions,
          nextReviewAt: next.nextReviewAt,
          lastReviewedAt: next.lastReviewedAt ?? new Date(),
          correctCount: card.correctCount + (correct ? 1 : 0),
          wrongCount: card.wrongCount + (correct ? 0 : 1),
        })
        .where(eq(cards.id, body.cardId));
    }
  }

  return jsonOk({
    verdict: result.verdict,
    errorType: result.error_type,
    corrected: result.corrected,
    explanation: result.explanation,
    rating,
  });
}
