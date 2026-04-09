// POST /api/phrases/review
// { phraseId: number, rating: 0|1|2|3 }
// Applies SM-2 to the phrase's embedded SRS state.

import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { phrases } from "@/lib/db/schema";
import { applyRating } from "@/lib/srs";
import { jsonError, jsonOk } from "@/lib/api";

export const runtime = "nodejs";

const Body = z.object({
  phraseId: z.number().int().positive(),
  rating: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return jsonError(
      `Invalid body: ${err instanceof Error ? err.message : String(err)}`,
      400
    );
  }

  const existing = await db
    .select()
    .from(phrases)
    .where(eq(phrases.id, body.phraseId))
    .limit(1);
  if (existing.length === 0) return jsonError("Phrase not found", 404);
  const phrase = existing[0];

  const next = applyRating(
    {
      easeX100: phrase.easeFactor,
      intervalDays: phrase.intervalDays,
      repetitions: phrase.repetitions,
      nextReviewAt: phrase.nextReviewAt,
      lastReviewedAt: phrase.lastReviewedAt ?? null,
    },
    body.rating
  );
  const correct = body.rating >= 2;

  await db
    .update(phrases)
    .set({
      easeFactor: next.easeX100,
      intervalDays: next.intervalDays,
      repetitions: next.repetitions,
      nextReviewAt: next.nextReviewAt,
      lastReviewedAt: next.lastReviewedAt ?? new Date(),
      correctCount: phrase.correctCount + (correct ? 1 : 0),
      wrongCount: phrase.wrongCount + (correct ? 0 : 1),
    })
    .where(eq(phrases.id, body.phraseId));

  return jsonOk({
    phraseId: phrase.id,
    intervalDays: next.intervalDays,
    repetitions: next.repetitions,
    easeFactor: next.easeX100,
    nextReviewAt: next.nextReviewAt.toISOString(),
  });
}
