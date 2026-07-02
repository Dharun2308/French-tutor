// GET /api/phrases/next?count=N&categories=fill_article,fill_preposition
// Returns the next N due phrases honoring the user's active phrase categories.
// Optional `categories` param narrows to specific categories (e.g. for
// the fill-in-the-blank drill mode). Still intersected with the user's
// active categories from Settings.
//
// Selection is balanced across categories: due cards are grouped by
// category and picked round-robin, so a bulky category (countries has 50+
// cards) can't monopolize a batch just because it was seeded early. Within
// a category, previously-reviewed overdue cards come first (real SRS
// backlog), then new cards in frequencyRank order.

import { NextRequest } from "next/server";
import { and, eq, inArray, lte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { phrases, type Phrase } from "@/lib/db/schema";
import { getSettings, jsonError, jsonOk } from "@/lib/api";
import { ensureSeeded } from "@/lib/seed/ensure-seeded";
import { FILL_BLANK_CATEGORIES } from "@/types";

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeeded();
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
    // No explicit filter = the flashcards feed. Exclude fill-in-the-blank
    // categories — their "english" field is a French sentence with a blank,
    // which makes no sense as a translate-this flashcard. The drill page
    // requests them explicitly via the categories param.
    const fill = new Set<string>(FILL_BLANK_CATEGORIES);
    activeCategories = allActive.filter((c) => !fill.has(c));
  }

  if (activeCategories.length === 0) {
    return jsonError(
      "No active phrase categories — enable some in Settings.",
      409
    );
  }

  const now = new Date();

  // Fetch the whole due pool (the phrases table is small — under a thousand
  // rows), then balance in memory.
  const pool = await db
    .select()
    .from(phrases)
    .where(
      and(
        eq(phrases.suspended, false),
        lte(phrases.nextReviewAt, now),
        inArray(phrases.category, activeCategories),
        inArray(phrases.level, activeLevels)
      )
    );

  // Group by category; order each group: reviewed-overdue first (most
  // overdue first), then unseen cards by frequencyRank.
  const byCategory = new Map<string, Phrase[]>();
  for (const r of pool) {
    const group = byCategory.get(r.category);
    if (group) group.push(r);
    else byCategory.set(r.category, [r]);
  }
  for (const group of byCategory.values()) {
    group.sort((a, b) => {
      const aNew = a.repetitions === 0;
      const bNew = b.repetitions === 0;
      if (aNew !== bNew) return aNew ? 1 : -1;
      return aNew
        ? a.frequencyRank - b.frequencyRank
        : a.nextReviewAt.getTime() - b.nextReviewAt.getTime();
    });
  }

  // Round-robin across categories (order shuffled per request) until the
  // batch is full or the pool runs dry.
  const groups = shuffle([...byCategory.values()]);
  const rows: Phrase[] = [];
  for (let i = 0; rows.length < count && groups.length > 0; ) {
    const group = groups[i % groups.length];
    const next = group.shift();
    if (next) rows.push(next);
    if (group.length === 0) {
      groups.splice(i % groups.length, 1);
      // don't advance i — the next group slid into this slot
      i = groups.length > 0 ? i % groups.length : 0;
    } else {
      i++;
    }
  }
  shuffle(rows);

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
