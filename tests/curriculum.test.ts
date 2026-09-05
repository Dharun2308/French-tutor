import { test } from "node:test";
import assert from "node:assert/strict";
import { TOPICS, TOPIC_BY_ID } from "../src/lib/curriculum/catalog";
import { assessment, dailyPlan, earliestReview, errorWeight, initialState, reviewDate, successfulErrorReview } from "../src/lib/curriculum/progression";

test("imported history is coverage, never fabricated mastery; new pronouns stay new", () => {
  assert.equal(initialState(TOPIC_BY_ID.get("present")!), "PRODUCTION_PRACTICE");
  assert.equal(initialState(TOPIC_BY_ID.get("pc-imparfait")!), "CONTROLLED_PRACTICE");
  assert.equal(initialState(TOPIC_BY_ID.get("direct-objects")!), "NOT_STARTED");
  assert.equal(initialState(TOPIC_BY_ID.get("subjunctive")!), "NOT_STARTED");
  assert.equal(new Set(TOPICS.map((t) => t.id)).size, TOPICS.length);
  assert.ok(TOPICS.every((t) => t.prerequisites.every((p) => TOPIC_BY_ID.has(p))));
});
test("85% progression uses exact ratios and adequate sample size", () => {
  assert.equal(assessment(8, 8), "insufficient");
  assert.equal(assessment(9, 10), "pass");
  assert.equal(assessment(8, 10), "targeted");
  assert.equal(assessment(17, 20), "pass");
  assert.equal(assessment(16, 20), "targeted");
  assert.equal(assessment(14, 20), "targeted");
  assert.equal(assessment(13, 20), "reteach");
});
test("maintenance expands to monthly, and recurring error weight decays", () => {
  const now = 1000;
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((step) => (reviewDate(step, now).getTime() - now) / 86_400_000), [1, 3, 7, 14, 30, 30]);
  assert.equal(errorWeight(0, false), 3);
  assert.equal(errorWeight(3, true), 2);
  assert.equal(errorWeight(0, true), 0);
  assert.equal(errorWeight(20, false), 20);
});
test("daily mix excludes new topics and balances old/current/mixed/oral", () => {
  const plan = dailyPlan([
    { id: "present", state: "MAINTENANCE", priority: 30, dueAt: new Date(0), errorWeight: 0 },
    { id: "article-negation", state: "PRODUCTION_PRACTICE", priority: 100, dueAt: null, errorWeight: 9 },
    { id: "subjunctive", state: "NOT_STARTED", priority: 200, dueAt: null, errorWeight: 20 },
  ]);
  assert.equal(plan.length, 10);
  assert.equal(plan.filter((p) => p.topicId === "subjunctive").length, 0);
  assert.equal(plan.filter((p) => p.stage === "production").length, 4);
  assert.equal(plan.filter((p) => p.stage === "oral").length, 2);
  assert.ok(plan.filter((p) => p.stage === "oral").every((p) => p.topicId === "present"));
  assert.equal(dailyPlan([]).length, 0);
  assert.ok(dailyPlan([{ id: "present", state: "PRODUCTION_PRACTICE", priority: 30, dueAt: null, errorWeight: 0 }]).every((q) => q.stage !== "oral"));
});
test("three repeated misses survive immediate remediation and return the next day", () => {
  const missed = new Date(1000);
  const delayed = new Date(1000 + 15 * 60_000);
  assert.equal(successfulErrorReview(delayed, missed, 3, 0, 2000)?.getTime(), delayed.getTime());
  const nextDay = successfulErrorReview(delayed, missed, 3, 0, delayed.getTime() + 1)!;
  assert.equal(nextDay.getTime(), missed.getTime() + 86_400_000);
  assert.equal(successfulErrorReview(nextDay, missed, 3, 0, nextDay.getTime() + 1), null);
});
test("error deadlines are order-independent and preserve pending retrieval until actually tested", () => {
  const maintenance = new Date(30 * 86_400_000);
  const soon = { reviewAt: new Date(15 * 60_000) };
  const tomorrow = { reviewAt: new Date(86_400_000) };
  assert.equal(earliestReview(maintenance, [soon, tomorrow])?.getTime(), soon.reviewAt.getTime());
  assert.equal(earliestReview(maintenance, [tomorrow, soon])?.getTime(), soon.reviewAt.getTime());
  assert.equal(earliestReview(maintenance, [{ reviewAt: null }])?.getTime(), maintenance.getTime());
  assert.equal(earliestReview(null, []), null);
  assert.equal(successfulErrorReview(soon.reviewAt, new Date(0), 1, 2, 1000)?.getTime(), soon.reviewAt.getTime());
});
test("daily mix current work follows recent practice rather than the largest old error weight", () => {
  const plan = dailyPlan([
    { id: "old", state: "PRODUCTION_PRACTICE", priority: 100, dueAt: new Date(0), errorWeight: 20, lastStudiedAt: new Date(1000) },
    { id: "current", state: "PRODUCTION_PRACTICE", priority: 20, dueAt: null, errorWeight: 0, lastStudiedAt: new Date(2000) },
  ]);
  assert.ok(plan.filter((q) => q.stage === "production").every((q) => q.topicId === "current"));
  assert.equal(TOPIC_BY_ID.get("communication-1")?.title, "Asking for directions");
  assert.equal(TOPIC_BY_ID.get("communication-38")?.title, "Making recommendations");
});
