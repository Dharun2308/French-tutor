import { test } from "node:test";
import assert from "node:assert/strict";
import { startOfUserDay, startOfUserWeek } from "../src/lib/timezone";

test("day starts at Denver midnight during daylight time", () => {
  assert.equal(
    startOfUserDay(new Date("2026-09-02T18:00:00Z"), "America/Denver").toISOString(),
    "2026-09-02T06:00:00.000Z"
  );
});

test("day start uses the post-DST offset", () => {
  assert.equal(
    startOfUserDay(new Date("2026-11-04T18:00:00Z"), "America/Denver").toISOString(),
    "2026-11-04T07:00:00.000Z"
  );
});

test("invalid timezone day start falls back to UTC", () => {
  assert.equal(
    startOfUserDay(new Date("2026-09-02T18:00:00Z"), "Not/AZone").toISOString(),
    "2026-09-02T00:00:00.000Z"
  );
});

test("week starts Monday midnight in Denver during daylight time", () => {
  assert.equal(
    startOfUserWeek(new Date("2026-09-02T18:00:00Z"), "America/Denver").toISOString(),
    "2026-08-31T06:00:00.000Z"
  );
});

test("week start uses the post-DST offset", () => {
  assert.equal(
    startOfUserWeek(new Date("2026-11-04T18:00:00Z"), "America/Denver").toISOString(),
    "2026-11-02T07:00:00.000Z"
  );
});

test("invalid timezone falls back to UTC Monday", () => {
  assert.equal(
    startOfUserWeek(new Date("2026-09-02T18:00:00Z"), "Not/AZone").toISOString(),
    "2026-08-31T00:00:00.000Z"
  );
});
