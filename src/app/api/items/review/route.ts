// POST /api/items/review
// { itemId, rating: 0|1|2|3, direction?, verdict?, userAnswer?, elapsedMs?, gradedBy? }
// Applies FSRS, updates the item's counters, appends to item_reviews.

import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { itemReviews, learningItems } from "@/lib/db/schema";
import { applyItemRating, FSRS_STATE_LABELS } from "@/lib/fsrs";
import { jsonError, jsonOk } from "@/lib/api";
import { REVIEW_DIRECTIONS } from "@/types";

export const runtime = "nodejs";

const Body = z.object({
  itemId: z.number().int().positive(),
  rating: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  direction: z.enum(REVIEW_DIRECTIONS).default("production"),
  verdict: z.string().max(20).optional(),
  userAnswer: z.string().max(500).optional(),
  elapsedMs: z.number().int().min(0).max(3_600_000).optional(),
  gradedBy: z.string().max(20).optional(),
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

  const [item] = await db
    .select()
    .from(learningItems)
    .where(eq(learningItems.id, body.itemId))
    .limit(1);
  if (!item) return jsonError("Item not found", 404);

  const now = new Date();
  const next = applyItemRating(
    {
      fsrsState: item.fsrsState,
      stability: item.stability,
      difficulty: item.difficulty,
      elapsedDays: item.elapsedDays,
      scheduledDays: item.scheduledDays,
      learningSteps: item.learningSteps,
      reps: item.reps,
      lapses: item.lapses,
      dueAt: item.dueAt,
      lastReviewedAt: item.lastReviewedAt ?? null,
    },
    body.rating,
    now
  );
  const success = body.rating >= 2;

  const dir = body.direction;
  await db
    .update(learningItems)
    .set({
      fsrsState: next.fsrsState,
      stability: next.stability,
      difficulty: next.difficulty,
      elapsedDays: next.elapsedDays,
      scheduledDays: next.scheduledDays,
      learningSteps: next.learningSteps,
      reps: next.reps,
      lapses: next.lapses,
      dueAt: next.dueAt,
      lastReviewedAt: now,
      reviewCount: item.reviewCount + 1,
      successCount: item.successCount + (success ? 1 : 0),
      failureCount: item.failureCount + (success ? 0 : 1),
      lastFailureAt: success ? item.lastFailureAt : now,
      productionSeen: item.productionSeen + (dir === "production" ? 1 : 0),
      productionCorrect: item.productionCorrect + (dir === "production" && success ? 1 : 0),
      recognitionSeen: item.recognitionSeen + (dir === "recognition" ? 1 : 0),
      recognitionCorrect: item.recognitionCorrect + (dir === "recognition" && success ? 1 : 0),
      listeningSeen: item.listeningSeen + (dir === "listening" ? 1 : 0),
      listeningCorrect: item.listeningCorrect + (dir === "listening" && success ? 1 : 0),
    })
    .where(eq(learningItems.id, item.id));

  await db.insert(itemReviews).values({
    itemId: item.id,
    ratedAt: now,
    rating: body.rating,
    direction: dir,
    verdict: body.verdict ?? null,
    userAnswer: body.userAnswer ?? null,
    elapsedMs: body.elapsedMs ?? null,
    gradedBy: body.gradedBy ?? null,
    stabilityAfter: next.stability,
    difficultyAfter: next.difficulty,
    scheduledDays: next.scheduledDays,
  });

  return jsonOk({
    itemId: item.id,
    rating: body.rating,
    state: FSRS_STATE_LABELS[next.fsrsState] ?? String(next.fsrsState),
    dueAt: next.dueAt.toISOString(),
    scheduledDays: next.scheduledDays,
    stability: Math.round(next.stability * 100) / 100,
    difficulty: Math.round(next.difficulty * 100) / 100,
  });
}
