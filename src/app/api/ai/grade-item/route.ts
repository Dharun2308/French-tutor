// POST /api/ai/grade-item  { itemId, attempt }
//
// Two-stage grading. The local matcher (compareAnswerFlexible) settles exact
// and accents-only answers instantly and for free. Everything else — including
// 1–2 letter slips — goes to an AI provider (codex → claude → openai, per
// Settings), because a one-letter difference can be a harmless typo or a real
// grammar error (manger/mangé, le/la) and only the model can tell which. If
// every provider fails the answer is still revealed (with the local heuristic
// as a hint) so the learner can self-rate — grading must never block a session.

import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { learningItems } from "@/lib/db/schema";
import { compareAnswerFlexible } from "@/lib/normalize";
import { cardFor } from "@/lib/items/card";
import {
  GradeItemJsonSchema,
  GradeItemSchema,
  gradeItemSystemPrompt,
  gradeItemUserPrompt,
} from "@/lib/items/grade-prompt";
import {
  AllProvidersFailed,
  getEnabledProviders,
  runStructured,
  summarizeAttempts,
} from "@/lib/ai/providers";
import { jsonError, jsonOk } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import type { ItemVerdict, Rating } from "@/types";

export const runtime = "nodejs";

const Body = z.object({
  itemId: z.number().int().positive(),
  attempt: z.string().trim().min(1).max(500),
});

const VERDICT_RATING: Record<ItemVerdict, Rating> = {
  CORRECT: 2,
  ACCEPTABLE: 2,
  MINOR_ERROR: 1,
  WRONG: 0,
};

export async function POST(req: NextRequest) {
  const rl = rateLimit("grade_item", 60, 60_000);
  if (!rl.allowed) return jsonError("Too many grading requests. Slow down a moment.", 429);

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

  const face = cardFor(item);
  const target = face.targetFr;

  // ── Stage 1: local ──
  const local = compareAnswerFlexible(body.attempt, target);
  if (local === "exact") {
    return jsonOk({
      verdict: "CORRECT",
      errorType: "none",
      corrected: target,
      reason: "",
      suggestedRating: item.reps >= 3 ? 3 : 2,
      gradedBy: "local",
      target,
    });
  }
  if (local === "accent-typo") {
    return jsonOk({
      verdict: "MINOR_ERROR",
      errorType: "accent",
      corrected: target,
      reason: "Right words, wrong accents — the accent changes the form here.",
      suggestedRating: 1,
      gradedBy: "local",
      target,
    });
  }

  // ── Stage 2: AI ──
  try {
    const enabled = await getEnabledProviders();
    const r = await runStructured(
      {
        purpose: "grade",
        system: gradeItemSystemPrompt(),
        user: gradeItemUserPrompt({
          french: item.french,
          english: item.english,
          target,
          promptEn: face.promptEn,
          attempt: body.attempt,
        }),
        schemaName: "grade_item",
        jsonSchema: GradeItemJsonSchema as unknown as Record<string, unknown>,
      },
      GradeItemSchema,
      enabled
    );
    return jsonOk({
      verdict: r.data.verdict,
      errorType: r.data.error_type,
      corrected: r.data.corrected,
      reason: r.data.reason,
      suggestedRating: VERDICT_RATING[r.data.verdict],
      gradedBy: r.provider,
      target,
    });
  } catch (err) {
    const summary =
      err instanceof AllProvidersFailed
        ? summarizeAttempts(err.attempts)
        : err instanceof Error
          ? err.message
          : String(err);
    console.error("grade-item: AI unavailable:", summary);
    if (local === "typo") {
      // Close enough that the heuristic is a usable hint — but flag the caveat.
      return jsonOk({
        verdict: "ACCEPTABLE",
        errorType: "typo",
        corrected: target,
        reason: `Looks like a small slip, but AI grading is unavailable — check the ending yourself. (${summary})`,
        suggestedRating: 2,
        gradedBy: "local",
        target,
      });
    }
    return jsonOk({
      verdict: "UNGRADED",
      errorType: "other",
      corrected: target,
      reason: `AI grading unavailable — compare and rate it yourself. (${summary})`,
      suggestedRating: null,
      gradedBy: null,
      target,
    });
  }
}
