import { NextRequest } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { activeSelections, learningItems, tutorUsageEvents } from "@/lib/db/schema";
import { jsonError, jsonOk } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { TUTOR_USAGE_OUTCOMES } from "@/types";

export const runtime = "nodejs";

const Body = z
  .object({
    submissionId: z.string().uuid(),
    weekStart: z.string().datetime(),
    entries: z
      .array(
        z.object({
          itemId: z.number().int().positive(),
          outcome: z.enum(TUTOR_USAGE_OUTCOMES),
        })
      )
      .min(1)
      .max(10),
  })
  .refine((body) => new Set(body.entries.map((entry) => entry.itemId)).size === body.entries.length, {
    message: "Each item can appear only once.",
  });

export async function POST(req: NextRequest) {
  const rl = rateLimit("tutor_usage", 20, 60_000);
  if (!rl.allowed) return jsonError("Too many submissions. Wait a minute.", 429);

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return jsonError(`Invalid body: ${err instanceof Error ? err.message : String(err)}`, 400);
  }

  const weekStart = new Date(body.weekStart);
  const itemIds = body.entries.map((entry) => entry.itemId);
  const selected = await db
    .select({ itemId: activeSelections.itemId })
    .from(activeSelections)
    .where(
      and(
        eq(activeSelections.weekStart, weekStart),
        inArray(activeSelections.itemId, itemIds)
      )
    );
  if (selected.length !== itemIds.length) {
    return jsonError("Feedback can only be saved for items in that week's Active 10.", 409);
  }

  const now = new Date();
  const inserted = { natural: 0, helped: 0, not_used: 0 };
  await db.transaction(async (tx) => {
    for (const entry of body.entries) {
      const rows = await tx
        .insert(tutorUsageEvents)
        .values({
          submissionId: body.submissionId,
          itemId: entry.itemId,
          weekStart,
          occurredAt: now,
          outcome: entry.outcome,
        })
        .onConflictDoNothing()
        .returning({ id: tutorUsageEvents.id });
      if (rows.length === 0) continue;
      inserted[entry.outcome] += 1;
      if (entry.outcome === "natural") {
        await tx
          .update(learningItems)
          .set({
            spontaneousUsageCount: sql`${learningItems.spontaneousUsageCount} + 1`,
          })
          .where(eq(learningItems.id, entry.itemId));
      }
    }
  });

  // Return the persisted submission totals, not only newly inserted rows, so a
  // retry after a lost response still shows the correct success summary.
  const persisted = await db
    .select({ outcome: tutorUsageEvents.outcome })
    .from(tutorUsageEvents)
    .where(eq(tutorUsageEvents.submissionId, body.submissionId));
  const outcomes = { natural: 0, helped: 0, not_used: 0 };
  for (const row of persisted) {
    if (row.outcome === "natural" || row.outcome === "helped" || row.outcome === "not_used") {
      outcomes[row.outcome] += 1;
    }
  }
  return jsonOk({ saved: persisted.length, outcomes, inserted: inserted.natural + inserted.helped + inserted.not_used });
}
