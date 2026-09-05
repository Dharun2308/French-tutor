/** Deterministic integration checks; only a disposable, migrated /tmp DB is allowed. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { migrateTopics } from "./migrate-topics";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { topicAttempts, topicErrors, topicProgress, topicSessions } from "../src/lib/curriculum/schema";
import { actOnTopicSession, curriculumOverview, readTopicSession, startTopicSession } from "../src/lib/curriculum/service";
import type { CurriculumAI } from "../src/lib/curriculum/ai";
import type { Question } from "../src/lib/curriculum/types";

let serial = 0;
const ai: CurriculumAI = {
  theory: async () => ({ theory: { meaning: "Meaning", usage: "Use", formation: "Form", caution: "Exception", examples: [{ french: "Je la vois.", english: "I see her." }, { french: "Je les vois.", english: "I see them." }], teachBack: "Where is the pronoun?" }, provider: "fixture" }),
  questions: async (plan, previous, tags, remediation = false) => ({ provider: "fixture", questions: plan.map((p): Question => ({ ...p, id: randomUUID(), prompt: `Question ${++serial}`, answer: "Je la vois.", hint: "Before the verb.", rule: "Pronoun placement.", tag: p.tag ?? tags?.[0] ?? "PRONOUN_PLACEMENT", audio: "", remediation, hinted: false })) }),
  grade: async (question, answer) => ({ provider: "fixture", grade: { conceptCorrect: answer !== "wrong", minorOnly: answer === "minor", corrected: question.answer, explanation: answer === "wrong" ? "Put the pronoun before the verb." : "Correct.", errorTags: answer === "wrong" ? [question.tag] : [] } }),
};

async function main() {
  assert.ok(process.env.TURSO_DATABASE_URL?.startsWith("file:/tmp/"), "Disposable /tmp DB required");
  await migrateTopics(process.env.TURSO_DATABASE_URL!);
  const overview = await curriculumOverview();
  assert.equal(overview.recommendedNew, "direct-objects");
  assert.ok(overview.topics.every((t) => t.production.total === 0));
  await assert.rejects(startTopicSession("indirect-objects", "learn", ai), /First build accuracy/);
  let session = await startTopicSession("direct-objects", "learn", ai);
  assert.equal(session.stage, "theory");
  assert.equal((await startTopicSession("direct-objects", "learn", ai)).id, session.id);
  session = await actOnTopicSession({ action: "confirm", sessionId: session.id, teachBack: "Before the verb" }, ai);
  assert.equal(session.stage, "controlled");
  assert.ok(!("answer" in session.question!));
  assert.equal(session.question!.hint, null);
  async function complete(primaryAnswers: string[]) {
    let index = 0;
    let guard = 0;
    while (!session.completed && ++guard < 100) {
      const qid = session.question!.id;
      const answer = session.question!.remediation ? "correct" : primaryAnswers[index++] ?? "correct";
      session = await actOnTopicSession({ action: "answer", sessionId: session.id, questionId: qid, answer }, ai);
      // Network retries never produce duplicate history.
      await actOnTopicSession({ action: "answer", sessionId: session.id, questionId: qid, answer }, ai);
      session = await actOnTopicSession({ action: "next", sessionId: session.id, questionId: qid }, ai);
      const retry = await actOnTopicSession({ action: "next", sessionId: session.id, questionId: qid }, ai);
      assert.equal(retry.question?.id, session.question?.id);
    }
    assert.ok(session.completed, "Session must finish");
  }
  await complete(Array(5).fill("correct"));
  assert.equal((await curriculumOverview()).topics.find((t) => t.id === "direct-objects")!.state, "PRODUCTION_PRACTICE");
  session = await startTopicSession("direct-objects", "learn", ai);
  assert.equal(session.target, 20);
  // 17/20, including one minor spelling slip that correctly passes the concept.
  await complete(["wrong", "wrong", "wrong", "minor", ...Array(16).fill("correct")]);
  let topic = (await curriculumOverview()).topics.find((t) => t.id === "direct-objects")!;
  assert.equal(topic.state, "85_PERCENT_REACHED");
  assert.equal(topic.production.correct, 17);
  assert.equal(topic.production.total, 20);
  assert.ok(topic.dueAt!.getTime() > Date.now());
  const saved = await readTopicSession(session.id);
  assert.ok(saved.completed && saved.result?.includes("85%"));
  const attempts = await db.select().from(topicAttempts).where(eq(topicAttempts.sessionId, session.id));
  assert.equal(new Set(attempts.map((a) => a.questionId)).size, attempts.length);
  assert.ok(attempts.filter((a) => a.remediation).length >= 5, "Third miss adds three follow-ups");
  assert.equal(topic.oral, 0);
  const indirect = await startTopicSession("indirect-objects", "learn", ai);
  assert.equal(indirect.stage, "theory");
  // Hints preserve the prompt but prevent an independent success.
  session = await startTopicSession("present", "revisit", ai);
  const qid = session.question!.id;
  session = await actOnTopicSession({ action: "hint", sessionId: session.id, questionId: qid }, ai);
  assert.ok(session.question!.hint);
  session = await actOnTopicSession({ action: "answer", sessionId: session.id, questionId: qid, answer: "correct" }, ai);
  const [hinted] = await db.select().from(topicAttempts).where(eq(topicAttempts.questionId, qid));
  assert.equal(hinted.independent, false);
  await actOnTopicSession({ action: "leave", sessionId: session.id }, ai);
  // 80% triggers targeted refresh, not a full theory restart.
  session = await startTopicSession("present", "revisit", ai);
  await complete([...Array(4).fill("wrong"), ...Array(16).fill("correct")]);
  session = await startTopicSession("present", "learn", ai);
  assert.equal(session.stage, "targeted");
  assert.ok(session.theory);
  await complete(Array(5).fill("correct"));
  // <70% returns to a short explanation then guided practice.
  session = await startTopicSession("present", "revisit", ai);
  await complete([...Array(8).fill("wrong"), ...Array(12).fill("correct")]);
  session = await startTopicSession("present", "learn", ai);
  assert.equal(session.stage, "theory");
  // Persisted errors survive, and the daily mix excludes unstudied grammar.
  const mix = await startTopicSession("mixed", "mixed", ai);
  const [raw] = await db.select().from(topicSessions).where(eq(topicSessions.id, mix.id));
  const rows = await db.select().from(topicProgress);
  assert.ok(raw.data.questions.every((q) => rows.find((p) => p.topicId === q.topicId)?.state !== "NOT_STARTED"));
  assert.equal(mix.question!.topicTitle, null);
  assert.ok((await db.select().from(topicErrors)).length > 0);
  console.log(`Topics integration passed (${overview.topics.length} topics): imported coverage, prerequisites, theory, resume, hidden answers, retries, hints, 85%/80%/<70% branches, targeted follow-ups, maintenance, daily mix.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
