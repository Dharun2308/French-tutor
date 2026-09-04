import { test } from "node:test";
import assert from "node:assert/strict";
import { applyItemRating, applyListeningRating, ratingToGrade, retrievability, type ItemSrs } from "../src/lib/fsrs";

const fresh = (): ItemSrs => ({
  fsrsState: 0,
  stability: 0,
  difficulty: 0,
  elapsedDays: 0,
  scheduledDays: 0,
  learningSteps: 0,
  reps: 0,
  lapses: 0,
  dueAt: new Date(0),
  lastReviewedAt: null,
});

const DAY = 24 * 60 * 60 * 1000;

test("rating scale maps 0..3 → Again..Easy", () => {
  assert.deepEqual([0, 1, 2, 3].map((r) => ratingToGrade(r as 0 | 1 | 2 | 3)), [1, 2, 3, 4]);
});

test("first Good review leaves New state and schedules ahead", () => {
  const now = new Date("2026-09-02T12:00:00Z");
  const next = applyItemRating(fresh(), 2, now);
  assert.notEqual(next.fsrsState, 0);
  assert.equal(next.reps, 1);
  assert.ok(next.dueAt.getTime() > now.getTime());
  assert.equal(next.lastReviewedAt?.getTime(), now.getTime());
});

test("Again on a new item comes back within the hour, Easy comes back in days", () => {
  const now = new Date("2026-09-02T12:00:00Z");
  const again = applyItemRating(fresh(), 0, now);
  const easy = applyItemRating(fresh(), 3, now);
  assert.ok(again.dueAt.getTime() - now.getTime() < 60 * 60 * 1000, "Again should relearn soon");
  assert.ok(easy.dueAt.getTime() - now.getTime() >= 1 * DAY, "Easy should wait at least a day");
  assert.ok(easy.dueAt.getTime() > again.dueAt.getTime());
});

test("a lapse after Review state increments lapses", () => {
  const now = new Date("2026-09-02T12:00:00Z");
  let s = applyItemRating(fresh(), 3, now); // Easy → Review
  const later = new Date(s.dueAt.getTime() + DAY);
  s = applyItemRating(s, 0, later); // forgot it
  assert.equal(s.lapses, 1);
});

test("retrievability is 0 for unseen items and decays after a review", () => {
  const now = new Date("2026-09-02T12:00:00Z");
  assert.equal(retrievability(fresh(), now), 0);
  const s = applyItemRating(fresh(), 2, now);
  const soon = retrievability(s, new Date(now.getTime() + 60_000));
  const muchLater = retrievability(s, new Date(now.getTime() + 60 * DAY));
  assert.ok(soon > 0.5, `expected high recall soon after review, got ${soon}`);
  assert.ok(muchLater < soon, "recall should decay");
});

test("listening success never touches the FSRS card", () => {
  const now = new Date("2026-09-02T12:00:00Z");
  const scheduled = applyItemRating(fresh(), 3, now); // Easy → Review, due in days
  const later = new Date(now.getTime() + DAY);
  for (const rating of [2, 3] as const) {
    const after = applyListeningRating(scheduled, rating, later);
    assert.deepEqual(after, scheduled);
  }
  // A never-produced item stays New rather than being promoted by a dictation.
  const untouched = applyListeningRating(fresh(), 3, now);
  assert.equal(untouched.fsrsState, 0);
  assert.equal(untouched.reps, 0);
});

test("listening failure makes the item due now without a lapse", () => {
  const now = new Date("2026-09-02T12:00:00Z");
  const scheduled = applyItemRating(fresh(), 3, now);
  const later = new Date(now.getTime() + DAY);
  assert.ok(scheduled.dueAt.getTime() > later.getTime(), "precondition: not yet due");
  for (const rating of [0, 1] as const) {
    const after = applyListeningRating(scheduled, rating, later);
    assert.equal(after.dueAt.getTime(), later.getTime());
    assert.equal(after.lapses, scheduled.lapses);
    assert.equal(after.fsrsState, scheduled.fsrsState);
    assert.equal(after.stability, scheduled.stability);
  }
  // Already-overdue items keep their earlier due date.
  const overdue = { ...scheduled, dueAt: new Date(now.getTime() - DAY) };
  assert.equal(applyListeningRating(overdue, 0, now).dueAt.getTime(), overdue.dueAt.getTime());
});
