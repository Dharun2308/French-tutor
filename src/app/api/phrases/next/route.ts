// GET /api/phrases/next?count=N&categories=fill_article,fill_preposition
// Returns the next N due phrases honoring the user's active phrase categories.
// Optional `categories` param narrows to specific categories (e.g. for
// the fill-in-the-blank drill mode). Still intersected with the user's
// active categories from Settings.

import { NextRequest } from "next/server";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { phrases } from "@/lib/db/schema";
import { getSettings, jsonError, jsonOk } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const countParam = url.searchParams.get("count") ?? "10";
  const count = Math.min(50, Math.max(1, parseInt(countParam, 10) || 10));

  const s = await getSettings();
  const allActive = (s.activePhraseCategories as string[] | null) ?? [];
  const activeLevels = (s.activeLevels as string[]) ?? ["A1"];

  // Optional filter: if `categories` param is provided, narrow to those
  // (intersected with whatever the user has enabled in Settings).
  const requestedCats = url.searchParams.get("categories");
  let activeCategories: string[];
  if (requestedCats) {
    const requested = requestedCats.split(",").map((c) => c.trim());
    activeCategories = requested.filter((c) => allActive.includes(c));
    if (activeCategories.length === 0) {
      // Requested categories aren't enabled — return the requested ones
      // anyway so the drill page can show fill-blank content even if the
      // user hasn't explicitly toggled them in settings.
      activeCategories = requested;
    }
  } else {
    activeCategories = allActive;
  }

  if (activeCategories.length === 0) {
    return jsonError(
      "No active phrase categories — enable some in Settings.",
      409
    );
  }

  const now = new Date();

  const rows = await db
    .select()
    .from(phrases)
    .where(
      and(
        eq(phrases.suspended, false),
        lte(phrases.nextReviewAt, now),
        inArray(phrases.category, activeCategories),
        inArray(phrases.level, activeLevels)
      )
    )
    .orderBy(asc(phrases.nextReviewAt), asc(sql`random()`))
    .limit(count);

  return jsonOk({
    phrases: rows.map((r) => ({
      id: r.id,
      category: r.category,
      french: r.french,
      english: r.english,
      notes: r.notes,
      level: r.level,
      repetitions: r.repetitions,
    })),
    asOf: now.toISOString(),
  });
}
