// Diagnostic: how many verbs / conjugations / cards are in the DB?
// Run with: npm run check
//
// This is the same env-loading dance as scripts/seed.ts so it works whether
// you have .env or .env.local.

import "dotenv/config";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

async function main() {
  const { db } = await import("../src/lib/db/client");
  const { verbs, conjugations, cards, phrases, settings } = await import(
    "../src/lib/db/schema"
  );

  const v = await db.select().from(verbs);
  const c = await db.select().from(conjugations);
  const k = await db.select().from(cards);
  const p = await db.select().from(phrases);
  const s = await db.select().from(settings);

  console.log("─".repeat(40));
  console.log(`Verbs:         ${v.length}`);
  console.log(`Conjugations:  ${c.length}`);
  console.log(`Verb cards:    ${k.length}`);
  console.log(`Phrases:       ${p.length}`);
  // Break down phrases by category
  const byCat: Record<string, number> = {};
  for (const row of p) byCat[row.category] = (byCat[row.category] ?? 0) + 1;
  for (const [cat, n] of Object.entries(byCat)) {
    console.log(`  ${cat.padEnd(11)} ${n}`);
  }
  console.log("─".repeat(40));

  if (s.length > 0) {
    const row = s[0];
    console.log(`Active tenses: ${JSON.stringify(row.activeTenses)}`);
    console.log(`Active levels: ${JSON.stringify(row.activeLevels)}`);
    console.log(`Daily target:  ${row.dailyTarget}`);
    console.log(`Timezone:      ${row.timezone}`);
  } else {
    console.log("Settings row:  (missing — will be created on first dashboard load)");
  }
  console.log("─".repeat(40));

  if (k.length === 0) {
    console.log("→ No cards. Run: npm run seed");
  } else if (s.length > 0) {
    const tenses = s[0].activeTenses as string[];
    const levels = s[0].activeLevels as string[];
    // Count cards that match the current filter, computed in-memory from
    // the data we already fetched above.
    const verbById = new Map(v.map((x) => [x.id, x]));
    const conjById = new Map(c.map((x) => [x.id, x]));
    let matchCount = 0;
    for (const card of k) {
      const conj = conjById.get(card.conjugationId);
      if (!conj) continue;
      const verb = verbById.get(conj.verbId);
      if (!verb) continue;
      if (!tenses.includes(conj.tense)) continue;
      if (!levels.includes(verb.level)) continue;
      if (card.suspended) continue;
      matchCount++;
    }
    console.log(`Cards matching current settings: ${matchCount}`);
    if (matchCount === 0) {
      console.log("→ The DB has data, but your Settings filter excludes all of it.");
      console.log("  Visit http://localhost:3000/settings and enable at least one");
      console.log("  tense and level that your seeded verbs belong to (A1/present).");
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("✘ Check failed:", err);
  process.exit(1);
});
