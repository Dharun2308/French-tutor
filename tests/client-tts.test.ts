import test from "node:test";
import assert from "node:assert/strict";
import { effectiveBrowserRate } from "../src/lib/client-tts";

test("browser listening speeds use distinct mobile-safe rate steps", () => {
  assert.equal(effectiveBrowserRate(1), 1);
  assert.equal(effectiveBrowserRate(0.85), 0.7);
  assert.equal(effectiveBrowserRate(0.7), 0.5);
});

test("browser speech rate remains within the supported app range", () => {
  assert.equal(effectiveBrowserRate(0.1), 0.5);
  assert.equal(effectiveBrowserRate(2), 1.25);
  assert.equal(effectiveBrowserRate(1.1), 1.1);
});
