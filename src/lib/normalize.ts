// Answer normalization and comparison for fill-in-the-blank / flashcards.
//
// Subtlety: we want to be forgiving of typos and casing, but NOT of missing
// accents that change meaning. "parle" (present) and "parlé" (past participle)
// differ only by accent but represent different tenses — collapsing them would
// mask tense errors and pollute the SRS signal.

export type CompareResult = "exact" | "accent-typo" | "wrong";

const APOSTROPHES = /[’']/g;
const WHITESPACE = /\s+/g;

/** Lowercase, trim, collapse whitespace, normalize apostrophes. */
export function basicClean(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(APOSTROPHES, "'")
    .replace(WHITESPACE, " ");
}

/** Strip diacritics: é → e, ç → c, œ → oe, etc. */
export function stripAccents(s: string): string {
  return basicClean(s)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae");
}

/**
 * Compare a user answer to a target.
 *
 * - Returns "exact" when the cleaned strings match (casing/whitespace only).
 * - Returns "accent-typo" when the accent-stripped versions match but the
 *   cleaned versions don't. This is a soft-fail: still credit the user but
 *   flag it so they can learn the accent.
 * - Returns "wrong" otherwise.
 */
export function compareAnswer(user: string, target: string): CompareResult {
  const u = basicClean(user);
  const t = basicClean(target);
  if (u === t) return "exact";
  if (stripAccents(u) === stripAccents(t)) return "accent-typo";
  return "wrong";
}

/** Used by multiple-choice to de-dupe distractors case-insensitively. */
export function sameFormLoose(a: string, b: string): boolean {
  return basicClean(a) === basicClean(b);
}

// ── Flexible matching for typed answers ──
//
// Card targets often carry teaching annotations a learner shouldn't have
// to type: gender tags "l'œuf (m.)", variant pairs "bleu / bleue",
// country pairs "la France — en France", ellipses "Je voudrais…", and
// French punctuation "Comment allez-vous ?". Typed grading should accept
// any reasonable form of the actual answer — while still keeping accents
// meaningful (é vs e can change tense or meaning).

/** Remove parenthetical annotations and ellipses. */
function stripAnnotations(s: string): string {
  return s.replace(/\([^)]*\)/g, " ").replace(/…/g, " ");
}

/**
 * Normalize for comparison: drop punctuation that carries no meaning when
 * typing (question marks, commas, quotes) and treat hyphens as spaces
 * ("dix-sept" ≙ "dix sept"). Accents are preserved — they matter.
 */
function comparable(s: string): string {
  return basicClean(s.replace(/[?!.,;:«»"“”]/g, " ").replace(/-/g, " "));
}

/**
 * All acceptable typed forms of a target: the whole thing, each em-dash
 * part ("la France — en France" → both), and each slash variant
 * ("bleu / bleue" → both genders).
 */
export function acceptableAnswers(target: string): string[] {
  const stripped = stripAnnotations(target);
  const raw = new Set<string>([stripped]);
  for (const dashPart of stripped.split(/\s*[—–]\s*/)) {
    raw.add(dashPart);
    for (const slashPart of dashPart.split(/\s*\/\s*/)) {
      raw.add(slashPart);
    }
  }
  const out = new Set<string>();
  for (const r of raw) {
    const c = comparable(r);
    if (c) out.add(c);
  }
  return [...out];
}

/**
 * Like compareAnswer, but forgiving of annotations, variants, punctuation,
 * and hyphens in the target. Accent differences still only earn partial
 * credit ("accent-typo"), never "exact".
 */
export function compareAnswerFlexible(
  user: string,
  target: string
): CompareResult {
  const u = comparable(user);
  if (!u) return "wrong";
  let best: CompareResult = "wrong";
  for (const t of acceptableAnswers(target)) {
    if (u === t) return "exact";
    if (stripAccents(u) === stripAccents(t)) best = "accent-typo";
  }
  return best;
}

/**
 * Stable, short hash used to cache AI responses by prompt shape.
 * Not cryptographic — just needs to be deterministic and collision-resistant
 * enough for a single-user app.
 */
export function quickHash(input: string): string {
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0))
    .toString(16)
    .padStart(12, "0");
}
