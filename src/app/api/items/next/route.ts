// GET /api/items/next?count=20
// Due lesson items for a production-first review session. New items are due
// immediately (dueAt defaults to epoch / insert time). Overdue first, then by
// priority so tutor corrections surface before nice-to-haves.

import { NextRequest } from "next/server";
import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { learningItems } from "@/lib/db/schema";
import { jsonOk } from "@/lib/api";
import { cardFor } from "@/lib/items/card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const countParam = Number(req.nextUrl.searchParams.get("count") ?? 20);
  const count = Number.isInteger(countParam) ? Math.min(50, Math.max(1, countParam)) : 20;
  const now = new Date();

  const rows = await db
    .select()
    .from(learningItems)
    .where(and(eq(learningItems.suspended, false), lte(learningItems.dueAt, now)))
    .orderBy(asc(learningItems.dueAt), desc(learningItems.priority), asc(learningItems.id))
    .limit(count);

  const [{ c: dueTotal }] = await db
    .select({ c: sql<number>`count(*)` })
    .from(learningItems)
    .where(and(eq(learningItems.suspended, false), lte(learningItems.dueAt, now)));

  return jsonOk({
    dueTotal: Number(dueTotal),
    items: rows.map((r) => ({
      id: r.id,
      french: r.french,
      english: r.english,
      exampleFr: r.exampleFr,
      exampleEn: r.exampleEn,
      type: r.type,
      priority: r.priority,
      grammarTopic: r.grammarTopic,
      cefrLevel: r.cefrLevel,
      sourceContext: r.sourceContext,
      encounterCount: r.encounterCount,
      reps: r.reps,
      lapses: r.lapses,
      fsrsState: r.fsrsState,
      dueAt: r.dueAt,
      ...cardFor(r),
    })),
  });
}
