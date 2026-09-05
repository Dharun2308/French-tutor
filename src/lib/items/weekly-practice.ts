/** Rotate weekly phrases by actual practice, keeping weekly order for ties. */
export function orderWeeklyPractice(ids: number[], lastPracticed: Map<number, number>): number[] {
  return [...new Set(ids)].sort((a, b) =>
    (lastPracticed.get(a) ?? 0) - (lastPracticed.get(b) ?? 0)
  );
}

/** Spread personal phrases through a mixed session, starting with one. */
export function weavePersonalPractice<T>(personal: T[], other: T[], limit: number): T[] {
  const result: T[] = [];
  let p = 0;
  let o = 0;
  while (result.length < limit && (p < personal.length || o < other.length)) {
    if (p < personal.length) result.push(personal[p++]);
    for (let n = 0; n < 2 && o < other.length && result.length < limit; n++) result.push(other[o++]);
  }
  return result;
}
