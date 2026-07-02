// Lazy, idempotent auto-seeder.
//
// Vercel has no reliable "run once on deploy" hook for serverless functions,
// so instead we seed on demand: the first relevant request after a cold start
// calls ensureSeeded(). A cheap COUNT check makes the common case (already
// seeded) effectively free, and a module-level promise dedupes concurrent
// callers within a single instance. The actual inserts are additive-only and
// keyed on natural unique keys, so running this repeatedly is safe.

import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { verbs, conjugations, cards, phrases, settings } from "@/lib/db/schema";
import { build } from "@/lib/seed/build";
import { PHRASES } from "@/lib/seed/phrases";
import { getSettings } from "@/lib/api";

let seedPromise: Promise<void> | null = null;

/**
 * Additive schema migrations. SQLite's ALTER TABLE ADD COLUMN errors if the
 * column already exists, so each statement is individually try/caught —
 * running these on every cold start is safe and near-free.
 */
async function ensureColumns(): Promise<void> {
  const alters = [
    sql`ALTER TABLE phrases ADD COLUMN mnemonic text`,
    sql`ALTER TABLE cards ADD COLUMN mnemonic text`,
  ];
  for (const stmt of alters) {
    try {
      await db.run(stmt);
    } catch {
      // column already exists
    }
  }
}

/**
 * Ensure the database has the latest seed content. Cheap to call on every
 * request — it short-circuits once the row counts match the expected content.
 */
export function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeed().catch((err) => {
      // Reset so a later request can retry instead of caching the failure.
      seedPromise = null;
      console.error("[ensureSeeded] failed:", err);
    });
  }
  return seedPromise;
}

async function runSeed(): Promise<void> {
  await ensureColumns();

  const built = build();

  // Fast path: if the counts already cover the expected content, do nothing.
  const [{ c: verbCount }] = await db
    .select({ c: sql<number>`count(*)` })
    .from(verbs);
  const [{ c: phraseCount }] = await db
    .select({ c: sql<number>`count(*)` })
    .from(phrases);

  const needsVerbs = Number(verbCount) < built.length;
  const needsPhrases = Number(phraseCount) < PHRASES.length;
  if (!needsVerbs && !needsPhrases) return;

  // ---- Verbs + conjugations + cards ----
  if (needsVerbs) {
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
      }
    }

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
        }
      }
    }

    const missingCards = await db
      .select({ id: conjugations.id })
      .from(conjugations)
      .leftJoin(cards, eq(cards.conjugationId, conjugations.id))
      .where(isNull(cards.id));
    for (const row of missingCards) {
      await db.insert(cards).values({ conjugationId: row.id });
    }
  }

  // ---- Phrases ----
  let phrasesInserted = 0;
  if (needsPhrases) {
    const existingPhrases = await db.select().from(phrases);
    const phraseKeys = new Set(
      existingPhrases.map((p) => `${p.french}|${p.category}|${p.english}`)
    );
    for (const p of PHRASES) {
      const key = `${p.french}|${p.category}|${p.english}`;
      if (!phraseKeys.has(key)) {
        await db.insert(phrases).values({
          category: p.category,
          french: p.french,
          english: p.english,
          notes: p.notes ?? null,
          level: p.level,
          frequencyRank: p.frequencyRank,
        });
        phrasesInserted++;
      }
    }
  }

  // When new phrase content actually landed, surface it: merge any categories
  // that now have data into the user's active set (additive — never removes,
  // so deliberate de-selection after this point is respected on future runs).
  if (phrasesInserted > 0) {
    const s = await getSettings();
    const active = new Set<string>(
      (s.activePhraseCategories as string[] | null) ?? []
    );
    const before = active.size;
    for (const p of PHRASES) active.add(p.category);
    if (active.size > before) {
      await db
        .update(settings)
        .set({ activePhraseCategories: [...active] })
        .where(eq(settings.id, 1));
    }
  }
}
