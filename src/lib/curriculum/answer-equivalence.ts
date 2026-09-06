/** Ignore presentation differences, preserving accents, word endings and internal punctuation. */
export function equivalentTopicAnswers(answer: string, expected: string): boolean {
  const clean = (value: string) => value.normalize("NFC").trim()
    .replace(/[’‘]/g, "'").replace(/\s+/g, " ").toLowerCase()
    .replace(/(?<!\.)\.$/u, "").trim();
  const normalized = clean(answer);
  return normalized.length > 0 && normalized === clean(expected);
}
