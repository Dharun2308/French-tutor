import { test } from "node:test";
import assert from "node:assert/strict";
import { createReviewRequestId, reviewElapsedMs } from "../src/lib/client-review";

test("review elapsed time is clamped to the server limit", () => {
  assert.equal(reviewElapsedMs(1_000, 2_500), 1_500);
  assert.equal(reviewElapsedMs(1_000, 4_000_000), 3_600_000);
  assert.equal(reviewElapsedMs(2_000, 1_000), 0);
});

test("review request IDs are non-empty and unique", () => {
  const first = createReviewRequestId();
  const second = createReviewRequestId();
  assert.ok(first.length >= 8);
  assert.notEqual(first, second);
});
