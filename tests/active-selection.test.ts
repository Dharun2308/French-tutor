import { test } from "node:test";
import assert from "node:assert/strict";
import { selectWeeklyItems } from "../src/lib/items/active-selection";

const ranking = Array.from({ length: 14 }, (_, index) => ({ id: index + 1, score: 100 - index }));

test("weekly selection carries eligible pins then fills deterministically", () => {
  const chosen = selectWeeklyItems(ranking, [8, 3], 10);
  assert.deepEqual(chosen.slice(0, 2).map((choice) => choice.item.id), [8, 3]);
  assert.ok(chosen.slice(0, 2).every((choice) => choice.pinned));
  assert.deepEqual(chosen.slice(2).map((choice) => choice.item.id), [1, 2, 4, 5, 6, 7, 9, 10]);
});

test("weekly selection ignores stale and duplicate pins and never duplicates items", () => {
  const chosen = selectWeeklyItems(ranking.slice(0, 4), [99, 2, 2], 10);
  assert.deepEqual(chosen.map((choice) => choice.item.id), [2, 1, 3, 4]);
  assert.equal(new Set(chosen.map((choice) => choice.item.id)).size, chosen.length);
});

test("weekly selection caps an oversized pin list", () => {
  const chosen = selectWeeklyItems(ranking, ranking.map((item) => item.id), 10);
  assert.equal(chosen.length, 10);
  assert.ok(chosen.every((choice) => choice.pinned));
});
