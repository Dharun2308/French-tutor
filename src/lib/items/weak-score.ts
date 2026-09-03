import { retrievability, type ItemSrs } from "@/lib/fsrs";
import type { TutorUsageOutcome } from "@/types";

const DAY_MS = 86_400_000;

export interface WeakScoreItem extends ItemSrs {
  type: string;
  priority: number;
  encounterCount: number;
  createdAt: Date;
}

export interface WeakScoreReview {
  rating: number;
  ratedAt: Date;
}

export interface WeakScoreUsage {
  outcome: TutorUsageOutcome | string;
  occurredAt: Date;
}

export interface WeakScore {
  score: number;
  recallRisk: number;
  failureEvidence: number;
  correctionRecency: number;
  usefulness: number;
  transferCredit: number;
  reasons: string[];
}

function clamp(n: number, lo = 0, hi = 1): number {
  return Math.min(hi, Math.max(lo, n));
}

function ageDays(at: Date, now: Date): number {
  return Math.max(0, (now.getTime() - at.getTime()) / DAY_MS);
}

function decay(days: number, halfLife: number): number {
  return 2 ** (-days / halfLife);
}

/** Deterministic Phase 3 weak-item score. Higher means target sooner. */
export function weakScore(
  item: WeakScoreItem,
  reviews: WeakScoreReview[],
  usage: WeakScoreUsage[],
  now: Date = new Date()
): WeakScore {
  const isNew = item.reps === 0 || item.fsrsState === 0;
  const recallRisk = isNew ? 1 : clamp(1 - retrievability(item, now));

  const recentReviews = [...reviews]
    .sort((a, b) => b.ratedAt.getTime() - a.ratedAt.getTime())
    .slice(0, 10);
  let weightedFailures = 0;
  let reviewWeight = 0;
  for (const review of recentReviews) {
    const weight = decay(ageDays(review.ratedAt, now), 21);
    const severity = review.rating === 0 ? 1 : review.rating === 1 ? 0.6 : 0;
    weightedFailures += severity * weight;
    reviewWeight += weight;
  }
  // The floor of 1 keeps a lone old failure from retaining full strength forever.
  const failureEvidence = reviewWeight > 0 ? clamp(weightedFailures / Math.max(1, reviewWeight)) : 0;

  const correctionRecency =
    item.type === "correction"
      ? Math.max(0.35, decay(ageDays(item.createdAt, now), 45))
      : 0;
  const usefulness = clamp(
    0.75 * ((item.priority - 1) / 4) +
      0.25 * (Math.min(Math.max(0, item.encounterCount - 1), 3) / 3)
  );

  let transferCredit = 0;
  let naturalRecently = false;
  for (const event of usage) {
    const points = event.outcome === "natural" ? 12 : event.outcome === "helped" ? 4 : 0;
    const eventCredit = points * decay(ageDays(event.occurredAt, now), 42);
    transferCredit += eventCredit;
    if (event.outcome === "natural" && eventCredit >= 4) naturalRecently = true;
  }
  transferCredit = clamp(transferCredit, 0, 25);

  const raw =
    40 * recallRisk +
    25 * failureEvidence +
    15 * correctionRecency +
    20 * usefulness -
    transferCredit;
  const score = Math.round(clamp(raw, 0, 100) * 10) / 10;

  const candidates: Array<{ label: string; weight: number }> = [];
  if (isNew) candidates.push({ label: "New from your lesson", weight: 40 });
  else if (recallRisk >= 0.25)
    candidates.push({ label: "Recall is fading", weight: 40 * recallRisk });
  if (failureEvidence >= 0.2)
    candidates.push({ label: "Missed recently", weight: 25 * failureEvidence });
  if (item.type === "correction")
    candidates.push({ label: "Tutor correction", weight: 15 * correctionRecency });
  if (item.encounterCount > 1)
    candidates.push({ label: "Seen in several lessons", weight: 5 + item.encounterCount });
  if (item.priority >= 4)
    candidates.push({ label: "Useful in conversation", weight: 5 + item.priority });
  if (naturalRecently)
    candidates.push({ label: "Used naturally recently", weight: 1 });

  const reasons = candidates
    .sort((a, b) => b.weight - a.weight)
    .map((r) => r.label)
    .filter((label, index, all) => all.indexOf(label) === index)
    .slice(0, 2);

  return {
    score,
    recallRisk,
    failureEvidence,
    correctionRecency,
    usefulness,
    transferCredit,
    reasons,
  };
}
