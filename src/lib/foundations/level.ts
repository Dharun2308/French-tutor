import type { LearningItem } from "@/lib/db/schema";

// Retire cached rounds/retries when the difficulty policy changes; keep their ratings.
export const FOUNDATIONS_VERSION = 4;
export const FOUNDATIONS_LEVELS = ["A1", "A2"] as const;
export const FOUNDATIONS_MAX_WORDS = 6;
export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

export const isFoundationsLevel = (level: string) => FOUNDATIONS_LEVELS.some(allowed => allowed === level.trim().toUpperCase());

/** Foundations recalls the basic expression; longer tutor examples belong to other modes. */
export function foundationsCard(item: Pick<LearningItem, "french" | "english">) {
  return { promptEn: item.english.trim(), targetFr: item.french.trim() };
}

/** Conservative practice limits, not a CEFR classifier. A short A2 label alone isn't enough. */
export function isSimpleFoundationsFrench(value: string): boolean {
  if (!wordCount(value) || wordCount(value) > FOUNDATIONS_MAX_WORDS) return false;
  // Annotations, unfinished grammar templates and multiple sentences aren't recall cards.
  if (/[;:/()\n_…—–]|\.\.|[.!?]\s+\p{L}/u.test(value.trim())) return false;
  // Fold accents for token-boundary checks: JS \b otherwise treats è in lève as a boundary.
  const words = value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  // Keep the familiar existential and question forms without allowing relative clauses.
  const grammar = words.replace(/\bil (?:n )?y a\b/g, "il a")
    .replace(/^(?:qu est ce (?:que|qui)|est ce que|que|qui)\b/, "").trim();
  // Object en/y and stacked object pronouns were the main source of overly hard cards.
  // Prepositions remain fine: en France, en bus, en face de.
  if (/\b(?:j|tu|il|elle|on|nous|vous|ils|elles|ne|n|me|m|te|t|se|s|le|la|les|lui|leur) (?:en|y)\b/.test(grammar)) return false;
  if (/\b(?:en|y) (?:ai|as|a|avons|avez|ont|avais|avait|aurai|vais|vas|va|allons|allez|vont|veux|veut|prends|prend|parle|parles|pense|penses)\b/.test(grammar)) return false;
  if (/-\s*(?:en|y)\b/i.test(value)) return false;
  if (/\b(?:me|m|te|t|se|s|le|la|les|l) (?:le|la|les|l|lui|leur)\b/.test(grammar)) return false;
  if (/\b(?:je|tu|il|elle|on|nous|vous|ils|elles|ne) (?:nous|vous) (?:le|la|les|l|lui|leur)\b/.test(grammar)) return false;
  if (/\b(?:le|la|les)-(?:moi|toi|lui|nous|vous|leur)\b/i.test(value)) return false;
  // Reflexive compound tenses and linked clauses combine too many skills for this mode.
  if (/\b(?:me|m|te|t|se|s) (?:suis|es|est|sont|etais|etait|etaient)\b/.test(grammar)) return false;
  if (/\b(?:nous (?:ne )?nous|vous (?:ne )?vous) (?:sommes|etes|etions|etiez)\b/.test(grammar)) return false;
  if (/\b(?:que|qu|qui|dont|lequel|laquelle|lesquels|lesquelles|lorsque|lorsqu|puisque|puisqu|afin|quoique|bien que|parce que|mais|puis|cependant|pourtant|sinon)\b/.test(grammar)) return false;
  if (/\b(?:et|quand|si) (?:je|j|tu|il|elle|on|nous|vous|ils|elles)\b/.test(grammar)) return false;
  return true;
}

export function isFoundationsSource(source: { level: string; target: string; prompt: string }): boolean {
  return isFoundationsLevel(source.level)
    && isSimpleFoundationsFrench(source.target)
    && wordCount(source.prompt) > 0 && wordCount(source.prompt) <= 24;
}
