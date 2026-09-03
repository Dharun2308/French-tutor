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
