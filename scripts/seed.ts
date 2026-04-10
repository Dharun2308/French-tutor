// Local seed script. Run with `npm run seed`.
//
// Idempotent: picks up from wherever the last run left off, and is safe to
// re-run any time.
//
// Performance: this version does everything in bulk.
//   1) One SELECT for all verbs → map by infinitive.
//   2) One SELECT for all conjugations → set of (verbId,tense,person) keys.
//   3) Batch INSERT for missing verbs (small).
//   4) Re-SELECT verbs if any were inserted (so we have new IDs).
//   5) Batch INSERT for missing conjugations (chunked at 200 rows).
//   6) One SELECT for all conjugation IDs, one SELECT for all cards → diff
//      the set, batch INSERT for missing cards.
//   7) Ensure the singleton settings row exists.
//
// This replaces the old "await per row" approach which could take minutes
// over a high-latency connection.

import "dotenv/config";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import {
  verbs,
  conjugations,
  cards,
  phrases,
  settings,
} from "../src/lib/db/schema";
import { build, runSanityChecks } from "../src/lib/seed/build";
import { PHRASES } from "../src/lib/seed/phrases";

const CHUNK = 200;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

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
  const totalConj = built.reduce((a, v) => a + v.conjugations.length, 0);
  console.log(
    `  Sanity checks passed. ${built.length} verbs, ${totalConj} conjugations.`
  );

  // --- 1. Verbs ---
  const existingVerbs = await db.select().from(verbs);
  const verbIdByInfinitive = new Map<string, number>(
    existingVerbs.map((v) => [v.infinitive, v.id])
  );

  const verbsToInsert = built
    .filter((v) => !verbIdByInfinitive.has(v.infinitive))
    .map((v) => ({
      infinitive: v.infinitive,
      english: v.english,
      group: v.group,
      level: v.level,
      auxiliary: v.auxiliary,
      frequencyRank: v.frequencyRank,
    }));

  if (verbsToInsert.length > 0) {
    await db.insert(verbs).values(verbsToInsert);
    console.log(`→ Verbs: inserted ${verbsToInsert.length} new.`);
    // Re-read to pick up the new IDs.
    const refreshed = await db.select().from(verbs);
    verbIdByInfinitive.clear();
    for (const v of refreshed) verbIdByInfinitive.set(v.infinitive, v.id);
  } else {
    console.log(`→ Verbs: all ${built.length} already present.`);
  }

  // --- 2. Conjugations ---
  const existingConj = await db
    .select({
      id: conjugations.id,
      verbId: conjugations.verbId,
      tense: conjugations.tense,
      person: conjugations.person,
    })
    .from(conjugations);

  const conjKey = (verbId: number, tense: string, person: string) =>
    `${verbId}|${tense}|${person}`;
  const existingConjSet = new Set(
    existingConj.map((c) => conjKey(c.verbId, c.tense, c.person))
  );

  const conjToInsert: {
    verbId: number;
    tense: string;
    person: string;
    form: string;
    isIrregular: boolean;
  }[] = [];

  for (const v of built) {
    const verbId = verbIdByInfinitive.get(v.infinitive);
    if (!verbId) continue;
    for (const c of v.conjugations) {
      if (existingConjSet.has(conjKey(verbId, c.tense, c.person))) continue;
      conjToInsert.push({
        verbId,
        tense: c.tense,
        person: c.person,
        form: c.form,
        isIrregular: c.isIrregular,
      });
    }
  }

  if (conjToInsert.length > 0) {
    let done = 0;
    for (const batch of chunk(conjToInsert, CHUNK)) {
      await db.insert(conjugations).values(batch);
      done += batch.length;
      process.stdout.write(
        `\r→ Conjugations: ${done} / ${conjToInsert.length}`
      );
    }
    console.log(`  ✓`);
  } else {
    console.log(`→ Conjugations: all ${totalConj} already present.`);
  }

  // --- 3. Cards ---
  const allConj = await db
    .select({ id: conjugations.id })
    .from(conjugations);
  const existingCards = await db
    .select({ conjugationId: cards.conjugationId })
    .from(cards);
  const existingCardConjIds = new Set(
    existingCards.map((c) => c.conjugationId)
  );

  const cardsToInsert = allConj
    .filter((c) => !existingCardConjIds.has(c.id))
    .map((c) => ({ conjugationId: c.id }));

  if (cardsToInsert.length > 0) {
    let done = 0;
    for (const batch of chunk(cardsToInsert, CHUNK)) {
      await db.insert(cards).values(batch);
      done += batch.length;
      process.stdout.write(
        `\r→ Cards: ${done} / ${cardsToInsert.length}`
      );
    }
    console.log(`  ✓`);
  } else {
    console.log(`→ Cards: all ${allConj.length} already present.`);
  }

  // --- 4. Phrases (articles, numbers, greetings, etc.) ---
  const existingPhrases = await db
    .select({
      id: phrases.id,
      french: phrases.french,
      category: phrases.category,
      english: phrases.english,
    })
    .from(phrases);
  const phraseKey = (french: string, category: string, english: string) =>
    `${category}|${french}|${english}`;
  const existingPhraseSet = new Set(
    existingPhrases.map((p) => phraseKey(p.french, p.category, p.english))
  );

  const phrasesToInsert = PHRASES.filter(
    (p) => !existingPhraseSet.has(phraseKey(p.french, p.category, p.english))
  ).map((p) => ({
    category: p.category,
    french: p.french,
    english: p.english,
    notes: p.notes ?? null,
    level: p.level,
    frequencyRank: p.frequencyRank,
  }));

  if (phrasesToInsert.length > 0) {
    let done = 0;
    for (const batch of chunk(phrasesToInsert, CHUNK)) {
      await db.insert(phrases).values(batch);
      done += batch.length;
      process.stdout.write(`\r→ Phrases: ${done} / ${phrasesToInsert.length}`);
    }
    console.log(`  ✓`);
  } else {
    console.log(`→ Phrases: all ${PHRASES.length} already present.`);
  }

  // --- 5. Settings ---
  const existingSettings = await db.select().from(settings);
  if (existingSettings.length === 0) {
    await db.insert(settings).values({
      id: 1,
      dailyTarget: 20,
      activeTenses: ["present"],
      activeLevels: ["A1"],
      preferredRegister: "all",
      ttsMode: "browser",
      ttsVoice: "alloy",
      learningStage: "present",
      activePhraseCategories: [
        "article",
        "number",
        "question",
        "greeting",
        "phrase",
      ],
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
