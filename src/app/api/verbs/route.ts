// GET /api/verbs?level=A1&group=1&tense=present
// Returns verb rows with optional conjugations for the library page.

import { NextRequest } from "next/server";
import { and, asc, eq, inArray, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { verbs, conjugations } from "@/lib/db/schema";
import { jsonOk } from "@/lib/api";
import { LEVELS, TENSES, VERB_GROUPS, type Tense } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const level = url.searchParams.get("level");
  const group = url.searchParams.get("group");
  const tense = url.searchParams.get("tense");

  const verbFilters: SQL[] = [];
  if (level && (LEVELS as readonly string[]).includes(level)) {
    verbFilters.push(eq(verbs.level, level));
  }
  if (group && (VERB_GROUPS as readonly string[]).includes(group)) {
    verbFilters.push(eq(verbs.group, group));
  }

  const verbRows = await db
    .select()
    .from(verbs)
    .where(verbFilters.length ? and(...verbFilters) : undefined)
    .orderBy(asc(verbs.frequencyRank));

  if (verbRows.length === 0) {
    return jsonOk({ verbs: [] });
  }

  const tenseFilter =
    tense && (TENSES as readonly string[]).includes(tense)
      ? [tense as Tense]
      : null;

  const verbIds = verbRows.map((v) => v.id);
  const conjRows = await db
    .select()
    .from(conjugations)
    .where(
      and(
        inArray(conjugations.verbId, verbIds),
        tenseFilter ? inArray(conjugations.tense, tenseFilter) : undefined
      )
    );

  const byVerb = new Map<number, typeof conjRows>();
  for (const c of conjRows) {
    const list = byVerb.get(c.verbId) ?? [];
    list.push(c);
    byVerb.set(c.verbId, list);
  }

  return jsonOk({
    verbs: verbRows.map((v) => ({
      ...v,
      conjugations: byVerb.get(v.id) ?? [],
    })),
  });
}
