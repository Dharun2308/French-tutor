export interface FocusCandidate {
  id: number;
  dueAt: Date;
  priority: number;
}

export interface FocusPlanEntry {
  itemId: number;
  direction: "production" | "listening";
  source: "due" | "weak" | "weekly" | "listening" | "correction" | "backfill";
  freshContext?: boolean;
  variationId?: number;
  variationUnavailable?: boolean;
}

export const FOCUS_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Latest production/listening rating wins: a later miss clears an earlier success. */
export function focusCooldownIds(reviews: { itemId: number; rating: number; direction: string; ratedAt: Date }[], now = new Date()): number[] {
  const latest = new Map<number, { rating: number; ratedAt: Date }>();
  for (const review of reviews) {
    if (review.direction !== "production" && review.direction !== "listening") continue;
    if (review.ratedAt.getTime() > now.getTime() || now.getTime() - review.ratedAt.getTime() >= FOCUS_COOLDOWN_MS) continue;
    const previous = latest.get(review.itemId);
    // At the same timestamp, a miss takes precedence over a success.
    if (!previous || review.ratedAt > previous.ratedAt || (review.ratedAt.getTime() === previous.ratedAt.getTime() && review.rating < previous.rating)) latest.set(review.itemId, review);
  }
  return [...latest].filter(([, review]) => review.rating >= 2).map(([id]) => id);
}

/** Up to twelve unique eligible cards; never backfill from the success cooldown. */
export function buildFocusPlan(
  items: FocusCandidate[],
  weakIds: number[],
  correctionIds: number[],
  now = new Date(),
  weeklyIds: number[] = [],
  cooldownIds: number[] = []
): FocusPlanEntry[] {
  const cooling = new Set(cooldownIds);
  items = items.filter(item => !cooling.has(item.id));
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
