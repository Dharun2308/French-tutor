// POST /api/seed — token-guarded backup seeder for when you can't run
// `npm run seed` locally (e.g. seeding a prod Turso DB directly).
//
// Requires a matching `x-seed-token` header.

import { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { verbs, conjugations, cards, settings } from "@/lib/db/schema";
import { build, runSanityChecks } from "@/lib/seed/build";
import { jsonError, jsonOk } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const expected = process.env.SEED_TOKEN;
  if (!expected) {
    return jsonError("SEED_TOKEN not set on server", 500);
  }
  const got = req.headers.get("x-seed-token");
  if (got !== expected) return jsonError("Forbidden", 403);

  const built = build();
  try {
    runSanityChecks(built);
  } catch (err) {
    return jsonError(
      `Sanity check failed: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }

  let verbsInserted = 0;
  for (const v of built) {
    const existing = await db
      .select({ id: verbs.id })
      .from(verbs)
      .where(eq(verbs.infinitive, v.infinitive))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(verbs).values({
        infinitive: v.infinitive,
        english: v.english,
        group: v.group,
        level: v.level,
        auxiliary: v.auxiliary,
        frequencyRank: v.frequencyRank,
      });
      verbsInserted++;
    }
  }

  let conjInserted = 0;
  for (const v of built) {
    const [row] = await db
      .select({ id: verbs.id })
      .from(verbs)
      .where(eq(verbs.infinitive, v.infinitive))
      .limit(1);
    if (!row) continue;
    for (const c of v.conjugations) {
      const existing = await db
        .select({ id: conjugations.id })
        .from(conjugations)
        .where(
          and(
            eq(conjugations.verbId, row.id),
            eq(conjugations.tense, c.tense),
            eq(conjugations.person, c.person)
          )
        )
        .limit(1);
      if (existing.length === 0) {
        await db.insert(conjugations).values({
          verbId: row.id,
          tense: c.tense,
          person: c.person,
          form: c.form,
          isIrregular: c.isIrregular,
        });
        conjInserted++;
      }
    }
  }

  const missingCards = await db
    .select({ id: conjugations.id })
    .from(conjugations)
    .leftJoin(cards, eq(cards.conjugationId, conjugations.id))
    .where(isNull(cards.id));
  let cardsInserted = 0;
  for (const row of missingCards) {
    await db.insert(cards).values({ conjugationId: row.id });
    cardsInserted++;
  }

  const existingSettings = await db.select().from(settings).limit(1);
  if (existingSettings.length === 0) {
    await db.insert(settings).values({
      id: 1,
      dailyTarget: 20,
      activeTenses: ["present"],
      activeLevels: ["A1"],
      preferredRegister: "all",
      timezone: "UTC",
    });
  }

  return jsonOk({
    verbsInserted,
    conjInserted,
    cardsInserted,
  });
}
