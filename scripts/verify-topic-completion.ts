// Run only with an explicitly configured /tmp SQLite copy, never against live progress.
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { topicProgress, topicAttempts, topicErrors, topicSessions } from "../src/lib/curriculum/schema";
import { curriculumOverview, startTopicSession } from "../src/lib/curriculum/service";
import { TOPICS } from "../src/lib/curriculum/catalog";
import { PATCH } from "../src/app/api/topics/route";
import { migrateTopics } from "./migrate-topics";
import type { CurriculumAI } from "../src/lib/curriculum/ai";

async function main() {
  const url = process.env.TURSO_DATABASE_URL || "";
  assert.match(url, /^file:\/tmp\//);
  await migrateTopics(url);
  await migrateTopics(url); // Existing installations and repeated deploys are safe.
  await curriculumOverview();
  const snapshot = async () => ({
    progress: (await db.select().from(topicProgress)).map(({ manualDone: _manualDone, ...row }) => row),
    attempts: await db.select().from(topicAttempts), errors: await db.select().from(topicErrors), sessions: await db.select().from(topicSessions),
  });
  const before = await snapshot();
  const mark = (topicId: string, manualDone: unknown) => PATCH(new NextRequest("http://localhost/api/topics", {
    method: "PATCH", body: JSON.stringify({ topicId, manualDone }),
  }));
  assert.equal((await mark("article-negation", true)).status, 200);
  let overview = await curriculumOverview();
  assert.equal(overview.topics.find(t => t.id === "article-negation")?.manualDone, true);
  assert.notEqual(overview.recommendedReview, "article-negation");
  assert.equal((await mark("article-negation", true)).status, 200);
  assert.equal((await mark("article-negation", false)).status, 200);
  assert.equal((await curriculumOverview()).topics.find(t => t.id === "article-negation")?.manualDone, false);
  assert.equal((await mark("not-a-topic", true)).status, 404);
  assert.equal((await mark("mixed", true)).status, 404);
  assert.equal((await mark("article-negation", "true")).status, 400);
  assert.deepEqual(await snapshot(), before, "toggle/retry/invalid requests never change measured progress, attempts, errors, or active sessions");
  // All real topics support the manual marker, including prerequisite-locked ones.
  for (const topic of TOPICS) {
    assert.equal((await mark(topic.id, true)).status, 200);
  }
  assert.ok((await curriculumOverview()).topics.every(t => t.manualDone));
  assert.deepEqual(await snapshot(), before);
  // Check both the overview and session-start guard agree about manual prerequisites.
  const child = TOPICS.find(t => t.prerequisites.length > 0)!;
  await db.update(topicProgress).set({ state: "NOT_STARTED", manualDone: false });
  await db.update(topicSessions).set({ active: false });
  overview = await curriculumOverview();
  assert.equal(overview.topics.find(t => t.id === child.id)?.ready, false);
  for (const id of child.prerequisites) await mark(id, true);
  assert.equal((await curriculumOverview()).topics.find(t => t.id === child.id)?.ready, true);
  let called = false;
  const ai: CurriculumAI = {
    theory: async () => { called = true; throw new Error("fixture reached AI after prerequisite guard"); },
    questions: async () => { called = true; throw new Error("fixture reached AI after prerequisite guard"); },
    grade: async () => { throw new Error("not used"); },
  };
  await assert.rejects(startTopicSession(child.id, "learn", ai), /fixture reached AI/);
  assert.equal(called, true);
  await mark(child.prerequisites[0], false);
  assert.equal((await curriculumOverview()).topics.find(t => t.id === child.id)?.ready, false);
  await assert.rejects(startTopicSession(child.id, "learn", ai), /First build accuracy/);
  console.log("Passed: repeatable migration, Done/Unfinished persistence for all topics, invalid requests, untouched scores/history/sessions, recommendation exclusion and prerequisite unlock/relock.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
