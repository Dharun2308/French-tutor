// Local seed script. Run with `npm run seed`.
//
// Idempotent:
//   - Verbs: insert if not present, match by infinitive.
//   - Conjugations: insert if not present, match by (verb_id, tense, person).
//   - Cards: one per conjugation that doesn't already have one.
//   - Settings: ensure the singleton row exists.
//
// Safe to re-run after adding new verbs — it won't reset SRS state.

import "dotenv/config";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq, and, isNull } from "drizzle-orm";
import {
  verbs,
  conjugations,
  cards,
  settings,
} from "../src/lib/db/schema";
import { build, runSanityChecks } from "../src/lib/seed/build";

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    console.error(
      "✘ TURSO_DATABASE_URL missing. Copy .env.example to .env.local and fill it in."
    );
    process.exit(1);
  }

  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const db = drizzle(client);

  console.log("→ Building verb seed…");
  const built = build();
  runSanityChecks(built);
  console.log(`  Sanity checks passed. ${built.length} verbs, ${built.reduce((a, v) => a + v.conjugations.length, 0)} conjugations.`);

  // Verbs
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
  console.log(`→ Verbs: ${verbsInserted} new, ${built.length - verbsInserted} existing.`);

  // Conjugations
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
  console.log(`→ Conjugations: ${conjInserted} new.`);

  // Cards: one per conjugation (left join to find missing)
  const missingCards = await db
    .select({ id: conjugations.id })
    .from(conjugations)
    .leftJoin(cards, eq(cards.conjugationId, conjugations.id))
    .where(isNull(cards.id));
  let cardsInserted = 0;
  for (const row of missingCards) {
    await db.insert(cards).values({
      conjugationId: row.id,
    });
    cardsInserted++;
  }
  console.log(`→ Cards: ${cardsInserted} new.`);

  // Settings singleton
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
    console.log("→ Settings: singleton row created.");
  } else {
    console.log("→ Settings: already present.");
  }

  console.log("\n✓ Seed complete.");
  client.close();
}

main().catch((err) => {
  console.error("\n✘ Seed failed:", err);
  process.exit(1);
});
