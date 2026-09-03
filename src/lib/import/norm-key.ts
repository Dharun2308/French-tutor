// Canonical keys for duplicate detection on imported learning items.
//
// normKey answers "is this the same phrase?" for auto-merge. Case, surrounding
// punctuation, apostrophe style, whitespace and teaching annotations are noise
// ("Pas encore." ≙ "pas encore" ≙ "pas encore (adv.)"). Accents are NOT noise
// — pêcher/pécher are different words — so they survive here and only
// collapse in looseKey, which is used to *warn*, never to merge.

import { basicClean, stripAccents } from "@/lib/normalize";

const ANNOTATION = /\([^)]*\)/g;
const PUNCT = /[?!.,;:«»"“”„‹›()\[\]{}…]/g;
const EDGE_JUNK = /^['\-\s]+|['\-\s]+$/g;

export function normKey(french: string): string {
  return basicClean(
    french.replace(ANNOTATION, " ").replace(PUNCT, " ").replace(/\s*-\s*/g, "-")
  ).replace(EDGE_JUNK, "");
}

/** Accent-insensitive key — "possible duplicate" warnings only. */
export function looseKey(french: string): string {
  return stripAccents(normKey(french));
}

/**
 * Seeded phrases carry variants in one string — "bleu / bleue",
 * "la France — en France". Index each part so an imported "en France"
 * still finds the seeded row.
 */
export function splitVariants(french: string): string[] {
  const out = new Set<string>([french]);
  for (const dashPart of french.split(/\s*[—–]\s*/)) {
    out.add(dashPart);
    for (const slashPart of dashPart.split(/\s*\/\s*/)) out.add(slashPart);
  }
  return [...out].filter((s) => s.trim().length > 0);
}
