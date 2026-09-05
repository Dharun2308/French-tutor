import { test } from "node:test";
import assert from "node:assert/strict";
import { orderWeeklyPractice, weavePersonalPractice } from "../src/lib/items/weekly-practice";

test("weekly phrases rotate across sessions using actual review times", () => {
  const history = new Map([[1, 200], [2, 100]]);
  assert.deepEqual(orderWeeklyPractice([1, 2, 3, 4, 1], history), [3, 4, 2, 1]);
  history.set(3, 300);
  assert.deepEqual(orderWeeklyPractice([1, 2, 3, 4], history), [4, 2, 1, 3]);
});

test("Smart sessions space personal phrases between other practice and respect the cap", () => {
  assert.deepEqual(weavePersonalPractice([1, 2, 3], [11, 12, 13, 14, 15, 16], 8), [1, 11, 12, 2, 13, 14, 3, 15]);
});

test("Smart sessions work with only personal phrases or only legacy practice", () => {
  assert.deepEqual(weavePersonalPractice([1, 2, 3], [], 2), [1, 2]);
  assert.deepEqual(weavePersonalPractice([], [11, 12, 13], 3), [11, 12, 13]);
  assert.deepEqual(weavePersonalPractice([], [], 6), []);
});
