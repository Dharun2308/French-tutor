// Duplicate lookup for imported items, against BOTH learning_items and the
// seeded phrases table — otherwise a notebook "Quel temps fait-il ?" would be
// re-added on top of the one already in Foundations.
//
// Loads both tables once per call (≈900 rows). That is cheaper than a query
// per item and plenty for a single-user app.

import { db } from "@/lib/db/client";
import { learningItems, phrases } from "@/lib/db/schema";
import { looseKey, normKey, splitVariants } from "./norm-key";

export interface DuplicateHit {
  kind: "item" | "phrase";
  id: number;
  french: string;
  english: string;
  /** true = same normKey (commit will merge items); false = accents differ (warn only) */
  exact: boolean;
  /** learning_items only — how many times it has been imported so far */
  encounterCount?: number;
}

type Index = Map<string, DuplicateHit[]>;

function add(index: Index, key: string, hit: DuplicateHit): void {
  if (!key) return;
  const list = index.get(key);
  if (list) list.push(hit);
  else index.set(key, [hit]);
}

export async function findDuplicates(
  frenchList: string[]
): Promise<DuplicateHit[][]> {
  const [items, seeded] = await Promise.all([
    db
      .select({
        id: learningItems.id,
        french: learningItems.french,
        english: learningItems.english,
        normKey: learningItems.normKey,
        encounterCount: learningItems.encounterCount,
      })
      .from(learningItems),
    db
      .select({ id: phrases.id, french: phrases.french, english: phrases.english })
      .from(phrases),
  ]);

  const exact: Index = new Map();
  const loose: Index = new Map();

  for (const r of items) {
    const hit: DuplicateHit = {
      kind: "item",
      id: r.id,
      french: r.french,
      english: r.english,
      exact: true,
      encounterCount: r.encounterCount,
    };
    add(exact, r.normKey, hit);
    add(loose, looseKey(r.french), { ...hit, exact: false });
  }
  for (const r of seeded) {
    const hit: DuplicateHit = {
      kind: "phrase",
      id: r.id,
      french: r.french,
      english: r.english,
      exact: true,
    };
    for (const v of splitVariants(r.french)) {
      add(exact, normKey(v), hit);
      add(loose, looseKey(v), { ...hit, exact: false });
    }
  }

  return frenchList.map((f) => {
    const out: DuplicateHit[] = [];
    const seen = new Set<string>();
    for (const h of exact.get(normKey(f)) ?? []) {
      const k = `${h.kind}:${h.id}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push(h);
      }
    }
    for (const h of loose.get(looseKey(f)) ?? []) {
      const k = `${h.kind}:${h.id}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push(h);
      }
    }
    return out.slice(0, 5);
  });
}
