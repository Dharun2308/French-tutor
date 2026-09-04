/** Stable for one save attempt so a retry cannot create duplicate evidence. */
export function createReviewRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function reviewElapsedMs(startedAt: number, now = Date.now()): number {
  return Math.min(3_600_000, Math.max(0, now - startedAt));
}
