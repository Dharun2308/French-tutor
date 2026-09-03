import { test } from "node:test";
import assert from "node:assert/strict";
import { weakScore, type WeakScoreItem } from "../src/lib/items/weak-score";

const now = new Date("2026-09-02T18:00:00.000Z");

function item(overrides: Partial<WeakScoreItem> = {}): WeakScoreItem {
  return {
    type: "phrase",
    priority: 3,
    encounterCount: 1,
    createdAt: new Date("2026-09-01T18:00:00.000Z"),
    fsrsState: 0,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    dueAt: now,
    lastReviewedAt: null,
    ...overrides,
  };
}

test("new useful corrections rank strongly and stay clamped", () => {
  const result = weakScore(item({ type: "correction", priority: 5, encounterCount: 4 }), [], [], now);
  assert.ok(result.score <= 100 && result.score >= 70);
  assert.ok(result.reasons.includes("New from your lesson"));
  assert.ok(result.reasons.includes("Tutor correction"));
});

test("recent failures increase weakness", () => {
  const base = item();
  const good = weakScore(base, [{ rating: 2, ratedAt: now }], [], now);
  const failed = weakScore(base, [{ rating: 0, ratedAt: now }], [], now);
  assert.ok(failed.score > good.score);
  assert.equal(failed.failureEvidence, 1);
});

test("natural usage has more than a twelve-point immediate effect and never goes negative", () => {
  const base = weakScore(item({ priority: 5 }), [], [], now);
  const used = weakScore(
    item({ priority: 5 }),
    [],
    [
      { outcome: "natural", occurredAt: now },
      { outcome: "natural", occurredAt: now },
      { outcome: "natural", occurredAt: now },
    ],
    now
  );
  assert.ok(base.score - used.score >= 24);
  assert.ok(used.score >= 0);
});

test("old failures and tutor usage decay", () => {
  const old = new Date(now.getTime() - 84 * 86_400_000);
  const recentFailure = weakScore(item(), [{ rating: 0, ratedAt: now }], [], now);
  const oldFailure = weakScore(item(), [{ rating: 0, ratedAt: old }], [], now);
  assert.ok(recentFailure.failureEvidence > oldFailure.failureEvidence);

  const recentUse = weakScore(item(), [], [{ outcome: "natural", occurredAt: now }], now);
  const oldUse = weakScore(item(), [], [{ outcome: "natural", occurredAt: old }], now);
  assert.ok(recentUse.transferCredit > oldUse.transferCredit);
});
