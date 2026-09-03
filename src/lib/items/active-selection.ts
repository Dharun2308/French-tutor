export interface WeeklyChoice<T> {
  item: T;
  pinned: boolean;
  source: "auto" | "pinned";
}

/** Pure weekly picker: retain eligible pins in order, then fill from ranking. */
export function selectWeeklyItems<T extends { id: number }>(
  ranking: T[],
  priorPinnedIds: number[],
  size = 10
): Array<WeeklyChoice<T>> {
  const byId = new Map(ranking.map((item) => [item.id, item]));
  const seen = new Set<number>();
  const pinned: T[] = [];
  for (const id of priorPinnedIds) {
    const item = byId.get(id);
    if (!item || seen.has(id) || pinned.length >= size) continue;
    seen.add(id);
    pinned.push(item);
  }
  const automatic = ranking.filter((item) => !seen.has(item.id)).slice(0, size - pinned.length);
  return [
    ...pinned.map((item) => ({ item, pinned: true, source: "pinned" as const })),
    ...automatic.map((item) => ({ item, pinned: false, source: "auto" as const })),
  ];
}
