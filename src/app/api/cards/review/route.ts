// POST /api/cards/review
// { cardId: number, rating: 0|1|2|3 }
// Applies SM-2, returns the updated card state.

import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { cards } from "@/lib/db/schema";
import { applyRating } from "@/lib/srs";
import { jsonError, jsonOk } from "@/lib/api";

export const runtime = "nodejs";

const Body = z.object({
  cardId: z.number().int().positive(),
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
    .from(cards)
    .where(eq(cards.id, body.cardId))
    .limit(1);
  if (existing.length === 0) return jsonError("Card not found", 404);
  const card = existing[0];

  const prevState = {
    easeX100: card.easeFactor,
    intervalDays: card.intervalDays,
    repetitions: card.repetitions,
    nextReviewAt: card.nextReviewAt,
    lastReviewedAt: card.lastReviewedAt ?? null,
  };

  const next = applyRating(prevState, body.rating);

  const correct = body.rating >= 2;

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

  return jsonOk({
    cardId: card.id,
    intervalDays: next.intervalDays,
    repetitions: next.repetitions,
    easeFactor: next.easeX100,
    nextReviewAt: next.nextReviewAt.toISOString(),
  });
}
