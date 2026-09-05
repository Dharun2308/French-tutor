export interface FocusCandidate {
  id: number;
  dueAt: Date;
  priority: number;
}

export interface FocusPlanEntry {
  itemId: number;
  direction: "production" | "listening";
  source: "due" | "weak" | "weekly" | "listening" | "correction" | "backfill";
}

/** Twelve unique cards; weekly phrases occupy the three targeted production slots. */
export function buildFocusPlan(
  items: FocusCandidate[],
  weakIds: number[],
  correctionIds: number[],
  now = new Date(),
  weeklyIds: number[] = []
): FocusPlanEntry[] {
  const allowed = new Set(items.map((i) => i.id));
  const used = new Set<number>();
  const buckets: FocusPlanEntry[][] = [];
  const take = (ids: number[], count: number, source: FocusPlanEntry["source"], direction: FocusPlanEntry["direction"] = "production") => {
    const bucket: FocusPlanEntry[] = [];
    for (const id of ids) {
      if (bucket.length >= count) break;
      if (!allowed.has(id) || used.has(id)) continue;
      used.add(id); bucket.push({ itemId: id, direction, source });
    }
    buckets.push(bucket);
  };
  const due = [...items].filter((i) => i.dueAt.getTime() <= now.getTime()).sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || b.priority - a.priority).map((i) => i.id);
  // Reserve scarce evidence first so a broad "due" pool cannot consume it.
  take(weeklyIds, 3, "weekly");
  const weeklyCount = used.size;
  take(weeklyIds.concat(weakIds, items.map((i) => i.id)), 2, "listening", "listening");
  take(correctionIds, 2, "correction");
  take(weakIds, 3 - weeklyCount, "weak");
  take(due, 5, "due");
  take(due.concat(weakIds, correctionIds, items.map((i) => i.id)), 12, "backfill");
  const out = buckets.flat();
  return out.slice(0, 12);
}
