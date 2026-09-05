import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFocusPlan } from "../src/lib/items/focus-plan";

const now = new Date("2026-09-02T12:00:00Z");
const items = Array.from({ length: 14 }, (_, i) => ({
  id: i + 1,
  dueAt: new Date(now.getTime() - (i + 1) * 1_000),
  priority: 5 - (i % 5),
}));

test("focus plan uses the requested whole-card mix when evidence is available", () => {
  const plan = buildFocusPlan(items, [3, 4, 5, 6, 7, 8, 9], [1, 2], now);
  assert.equal(plan.length, 12);
  assert.equal(plan.filter((x) => x.source === "due").length, 5);
  assert.equal(plan.filter((x) => x.source === "weak").length, 3);
  assert.equal(plan.filter((x) => x.source === "listening").length, 2);
  assert.equal(plan.filter((x) => x.source === "correction").length, 2);
  assert.equal(new Set(plan.map((x) => x.itemId)).size, 12);
  assert.ok(plan.filter((x) => x.source === "listening").every((x) => x.direction === "listening"));
});

test("focus plan backfills missing buckets without duplicate items", () => {
  const plan = buildFocusPlan(items.slice(0, 6), [], [], now);
  assert.equal(plan.length, 6);
  assert.equal(new Set(plan.map((x) => x.itemId)).size, 6);
});

test("weekly phrases appear in production and listening even when they are not due", () => {
  const future = items.map((item) => ({ ...item, dueAt: new Date(now.getTime() + 86_400_000) }));
  const plan = buildFocusPlan(future, [1, 2, 3], [6, 7], now, [14, 13, 12, 11, 10]);
  assert.deepEqual(plan.filter((entry) => entry.source === "weekly").map((entry) => entry.itemId), [14, 13, 12]);
  assert.deepEqual(plan.filter((entry) => entry.direction === "listening").map((entry) => entry.itemId), [11, 10]);
  assert.equal(plan.length, 12);
  assert.equal(new Set(plan.map((entry) => entry.itemId)).size, 12);
});

test("stale or duplicate weekly IDs cannot consume slots or introduce missing items", () => {
  const plan = buildFocusPlan(items.slice(0, 4), [2, 3, 4], [], now, [99, 1, 1]);
  assert.equal(plan.length, 4);
  assert.equal(plan.filter((entry) => entry.source === "weekly").length, 1);
  assert.deepEqual([...new Set(plan.map((entry) => entry.itemId))].sort(), [1, 2, 3, 4]);
});
