/** Regression checks for the Fable review. Never run against learner data. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { migrateTopics } from "./migrate-topics";
import { TOPIC_BY_ID } from "../src/lib/curriculum/catalog";
import { AllProvidersFailed } from "../src/lib/ai/providers";
import { actOnTopicSession as act, startTopicSession as start, curriculumOverview, readTopicSession, TopicConflict, TopicNotFound } from "../src/lib/curriculum/service";
import { topicAttempts, topicErrors, topicProgress, topicSessions } from "../src/lib/curriculum/schema";
import type { CurriculumAI } from "../src/lib/curriculum/ai";
import type { TopicGrade, TopicState } from "../src/lib/curriculum/types";

const day = 86_400_000;
let serial = 0;
const ai: CurriculumAI = {
  theory: async () => ({ theory: { meaning: "Meaning", usage: "Use", formation: "Form", caution: "Exception", examples: [{ french: "Je la vois.", english: "I see her." }, { french: "Je les vois.", english: "I see them." }], teachBack: "Explain the rule." }, provider: "fixture" }),
  questions: async (plan, previous, tags, remediation = false) => ({ provider: "fixture", questions: plan.map((p) => ({ ...p, id: randomUUID(), prompt: `English question ${++serial}`, answer: "Je la vois.", hint: "Before the verb.", rule: "Pronoun placement.", tag: p.tag ?? TOPIC_BY_ID.get(p.topicId)!.tags[0], audio: "", remediation, hinted: false })) }),
  grade: async (q, answer) => ({ provider: "fixture", grade: { conceptCorrect: answer !== "wrong", corrected: q.answer, explanation: "Feedback in English.", minorOnly: false, errorTags: answer === "wrong" ? [q.tag] : [] } }),
};
type Session = Awaited<ReturnType<typeof start>>;
async function progress(id: string) { return (await db.select().from(topicProgress).where(eq(topicProgress.topicId, id)))[0]; }
async function setProgress(id: string, state: TopicState, step = 0, due: Date | null = null) {
  await db.update(topicProgress).set({ state, maintenanceStep: step, maintenanceDueAt: due, dueAt: due }).where(eq(topicProgress.topicId, id));
}
async function answer(s: Session, text = "correct", provider = ai) {
  return act({ action: "answer", sessionId: s.id, questionId: s.question!.id, answer: text }, provider);
}
async function next(s: Session, provider = ai) { return act({ action: "next", sessionId: s.id, questionId: s.question!.id }, provider); }
async function finish(s: Session, provider = ai) {
  let guard = 0;
  while (!s.completed && guard++ < 80) {
    if (!s.feedback) s = await answer(s, "correct", provider);
    s = await next(s, provider);
  }
  assert.ok(s.completed); return s;
}
async function leave(s: Session) { return act({ action: "leave", sessionId: s.id }, ai); }

async function main() {
  assert.ok(process.env.TURSO_DATABASE_URL?.startsWith("file:/tmp/"), "Disposable /tmp DB required");
  await migrateTopics(process.env.TURSO_DATABASE_URL!);
  await migrateTopics(process.env.TURSO_DATABASE_URL!); // fresh schema and restore/repeat path
  await curriculumOverview();

  let s = await start("pc-imparfait", "learn", ai);
  s = await next(await answer(s));
  await leave(s);
  s = await start("pc-imparfait", "learn", ai);
  assert.equal(s.stage, "controlled", "Early leave must not reteach");
  assert.equal((await readTopicSession(s.id)).question?.id, s.question?.id);
  await leave(s);

  const future = new Date(Date.now() + 30 * day);
  await setProgress("present", "MAINTENANCE", 4, future);
  s = await finish(await start("present", "revisit", ai));
  assert.equal((await progress("present")).maintenanceStep, 4);
  assert.equal((await progress("present")).maintenanceDueAt?.getTime(), future.getTime());
  assert.equal((await leave(s)).result, s.result, "Retried leave must preserve completed result");
  await setProgress("present", "MAINTENANCE", 2, new Date(Date.now() - day));
  await finish(await start("present", "revisit", ai));
  assert.equal((await progress("present")).maintenanceStep, 3, "Due revisit advances maintenance");

  await setProgress("present", "REVISIT_REQUIRED", 3, future);
  s = await start("present", "theory", ai);
  s = await act({ action: "confirm", sessionId: s.id }, ai);
  assert.equal(s.stage, "targeted");
  assert.equal((await progress("present")).state, "REVISIT_REQUIRED");
  assert.equal((await progress("present")).maintenanceDueAt?.getTime(), future.getTime());
  await leave(s);

  // Two tags in one grade: the 15-minute deadline must win regardless of insertion order.
  await setProgress("present", "MAINTENANCE", 4, future);
  await db.insert(topicErrors).values({ topicId: "present", tag: "VERB_FORM", misses: 2, weight: 6 }).onConflictDoUpdate({ target: [topicErrors.topicId, topicErrors.tag], set: { misses: 2, weight: 6, reviewAt: new Date(Date.now() + day) } });
  s = await start("present", "revisit", ai);
  const multi: CurriculumAI = { ...ai, grade: async (q) => ({ provider: "fixture", grade: { conceptCorrect: false, corrected: q.answer, explanation: "Two subrules.", minorOnly: false, errorTags: ["VERB_FORM", "GENDER_AGREEMENT"] } }) };
  s = await answer(s, "wrong", multi);
  let p = await progress("present");
  assert.ok(p.dueAt!.getTime() < Date.now() + 16 * 60_000);
  assert.equal(p.maintenanceDueAt, null, "Repeated errors restart maintenance rather than advancing the old ladder");
  assert.equal(p.maintenanceStep, 0);
  await leave(s);
  // Immediate successes cannot cancel the delayed retrieval; overdue zero-weight tags are retested.
  await db.update(topicErrors).set({ weight: 0, reviewAt: new Date(Date.now() - 1000), lastMissAt: new Date(Date.now() - 2 * day) })
    .where(and(eq(topicErrors.topicId, "present"), eq(topicErrors.tag, "VERB_FORM")));
  s = await start("present", "learn", ai);
  let raw = (await db.select().from(topicSessions).where(eq(topicSessions.id, s.id)))[0];
  assert.equal(raw.data.questions[0].tag, "VERB_FORM", "Retest overdue tags even at zero weight");
  s = await answer(s);
  const cleared = (await db.select().from(topicErrors).where(and(eq(topicErrors.topicId, "present"), eq(topicErrors.tag, "VERB_FORM"))))[0];
  assert.equal(cleared.reviewAt, null);
  p = await progress("present");
  assert.ok(p.dueAt!.getTime() > Date.now(), "A successfully retested stale tag must stop making the topic due");
  await leave(s);

  const outage: CurriculumAI = { ...ai, grade: async () => { throw new AllProvidersFailed([]); } };
  await setProgress("definite-articles", "MAINTENANCE", 3, future);
  s = await start("definite-articles", "revisit", ai);
  const qid = s.question!.id;
  s = await answer(s, "my exact answer", outage);
  assert.equal(s.feedback?.ungraded, true);
  assert.equal(s.feedback?.submitted, "my exact answer");
  assert.equal((await readTopicSession(s.id)).feedback?.ungraded, true);
  await answer(s, "retry", outage);
  assert.equal((await db.select().from(topicAttempts).where(eq(topicAttempts.questionId, qid))).length, 1);
  assert.equal((await db.select().from(topicErrors).where(eq(topicErrors.topicId, "definite-articles"))).length, 0);
  s = await next(s);
  assert.equal(s.question!.remediation, false);
  s = await finish(s, outage);
  assert.match(s.result!, /0\/20 questions graded/);
  assert.equal((await progress("definite-articles")).state, "MAINTENANCE");
  assert.equal((await progress("definite-articles")).maintenanceDueAt?.getTime(), future.getTime());
  const overview = await curriculumOverview();
  assert.equal(overview.topics.find((t) => t.id === "definite-articles")!.production.total, 0);

  // Assisted correct answers cannot pass a production check or hide the need to revisit.
  s = await start("indefinite-articles", "revisit", ai);
  while (!s.completed) {
    s = await act({ action: "hint", sessionId: s.id, questionId: s.question!.id }, ai);
    s = await next(await answer(s));
  }
  assert.equal((await progress("indefinite-articles")).state, "CONTROLLED_PRACTICE");
  assert.equal((await curriculumOverview()).topics.find((t) => t.id === "indefinite-articles")!.due, true);

  await setProgress("direct-objects", "REVISIT_REQUIRED");
  await setProgress("indirect-objects", "PRODUCTION_PRACTICE");
  assert.equal((await curriculumOverview()).topics.find((t) => t.id === "indirect-objects")!.ready, true);
  s = await start("indirect-objects", "learn", ai); await leave(s);
  await assert.rejects(start("present", "mixed", ai), /mixed topic/);
  await assert.rejects(start("mixed", "learn", ai), /mixed topic/);
  await assert.rejects(readTopicSession(randomUUID()), TopicNotFound);

  // Oral/reveal is practice evidence, never an independent written success.
  s = await start("definite-articles", "oral", ai);
  s = await act({ action: "reveal", sessionId: s.id, questionId: s.question!.id, spoken: true }, ai);
  const oral = (await db.select().from(topicAttempts).where(eq(topicAttempts.sessionId, s.id)))[0];
  assert.equal(oral.spoken, true); assert.equal(oral.independent, false);
  await leave(s);

  // Daily mix credits a due maintained topic only after independent written retrieval.
  await setProgress("present", "MAINTENANCE", 1, new Date(Date.now() - day));
  await setProgress("article-negation", "PRODUCTION_PRACTICE");
  await db.update(topicProgress).set({ lastStudiedAt: new Date(Date.now() + 1000) }).where(eq(topicProgress.topicId, "article-negation"));
  s = await start("mixed", "mixed", ai);
  raw = (await db.select().from(topicSessions).where(eq(topicSessions.id, s.id)))[0];
  assert.ok(raw.data.questions.filter((q) => q.topicId === "present" && q.stage !== "oral").length >= 2);
  s = await answer(s);
  assert.ok(s.question?.topicTitle);
  await finish(s);
  assert.equal((await progress("present")).maintenanceStep, 2);
  assert.ok((await progress("present")).maintenanceDueAt!.getTime() > Date.now() + 6 * day);

  s = await start("mixed", "mixed", ai);
  raw = (await db.select().from(topicSessions).where(eq(topicSessions.id, s.id)))[0];
  const missedTopic = raw.data.questions[0].topicId;
  s = await next(await answer(s, "wrong"));
  assert.equal(s.question?.remediation, true);
  raw = (await db.select().from(topicSessions).where(eq(topicSessions.id, s.id)))[0];
  assert.equal(raw.data.questions[raw.data.current].topicId, missedTopic);
  s = await finish(s);
  const mixedAttempts = await db.select().from(topicAttempts).where(eq(topicAttempts.sessionId, s.id));
  assert.equal(mixedAttempts.filter((a) => !a.remediation).length, 10);
  assert.ok(mixedAttempts.filter((a) => a.remediation).every((a) => !a.independent));

  // The real imported catalog has many eligible topics: a mix must not change the current one.
  const followMix = await start("mixed", "mixed", ai);
  const mixRow = (await db.select().from(topicSessions).where(eq(topicSessions.id, followMix.id)))[0];
  assert.ok(mixRow.data.questions.filter((q) => q.stage === "production").every((q) => q.topicId === "article-negation"));
  await leave(followMix);

  s = await start("mixed", "mixed", ai);
  const outageMix = (await db.select().from(topicSessions).where(eq(topicSessions.id, s.id)))[0];
  s = await next(await answer(s, "outage", outage));
  s = await finish(s);
  const outageMixAttempts = await db.select().from(topicAttempts).where(eq(topicAttempts.sessionId, s.id));
  assert.equal(outageMixAttempts.filter((a) => !a.remediation).length, 11);
  assert.equal(outageMixAttempts.at(-1)!.topicId, outageMix.data.questions[0].topicId);

  // A single grading outage receives a replacement, rather than wasting nineteen good answers.
  s = await start("definite-articles", "revisit", ai);
  s = await next(await answer(s, "outage", outage));
  s = await finish(s);
  const replacementAttempts = await db.select().from(topicAttempts).where(eq(topicAttempts.sessionId, s.id));
  assert.equal(replacementAttempts.filter((a) => !a.remediation).length, 21);
  assert.match(s.result!, /20\/20 correct/);

  // Scope pending tags to the topic and leave room for broad independent production.
  await setProgress("direct-objects", "PRODUCTION_PRACTICE");
  await db.insert(topicErrors).values([
    { topicId: "direct-objects", tag: "PRONOUN_PLACEMENT", misses: 1, weight: 3, reviewAt: new Date(Date.now() + day) },
    { topicId: "direct-objects", tag: "OTHER", misses: 1, weight: 3, reviewAt: new Date(Date.now() + day) },
  ]);
  let requested: Parameters<CurriculumAI["questions"]>[0] = [];
  let contextTags: string[] = [];
  const capture: CurriculumAI = { ...ai, questions: async (plan, previous, tags, remediation) => {
    requested = plan; contextTags = tags ?? []; return ai.questions(plan, previous, tags, remediation);
  } };
  s = await start("direct-objects", "revisit", capture);
  assert.equal(requested.filter((p) => p.tag === "PRONOUN_PLACEMENT").length, 1);
  assert.ok(requested.every((p) => p.tag !== "OTHER"));
  assert.ok(contextTags.includes("OTHER"));
  await leave(s);

  // Cleared historical misses cannot make one new slip a recurring-error failure.
  await setProgress("definite-articles", "MAINTENANCE", 3, future);
  await db.update(topicErrors).set({ misses: 9, weight: 0, reviewAt: null }).where(eq(topicErrors.topicId, "definite-articles"));
  s = await start("definite-articles", "revisit", ai);
  s = await answer(s, "wrong");
  assert.equal((await progress("definite-articles")).state, "MAINTENANCE");
  const freshMiss = (await db.select().from(topicErrors).where(eq(topicErrors.topicId, "definite-articles")))[0];
  assert.equal(freshMiss.misses, 1);
  assert.ok(freshMiss.reviewAt!.getTime() > Date.now() + 23 * 60 * 60_000);
  await leave(s);

  // Failing due maintenance, leaving a voluntary retry, then rebuilding must restart at day one.
  await setProgress("indefinite-articles", "MAINTENANCE", 3, new Date(Date.now() - day));
  s = await start("indefinite-articles", "learn", ai);
  while (!s.completed) {
    s = await act({ action: "hint", sessionId: s.id, questionId: s.question!.id }, ai);
    s = await next(await answer(s));
  }
  assert.equal((await progress("indefinite-articles")).maintenanceStep, 0);
  assert.equal((await progress("indefinite-articles")).needsTheory, true);
  await leave(await start("indefinite-articles", "revisit", ai));
  s = await start("indefinite-articles", "learn", ai);
  assert.equal(s.stage, "theory", "Reteaching requirement survives unrelated early exits");
  s = await act({ action: "confirm", sessionId: s.id }, ai);
  assert.equal((await progress("indefinite-articles")).needsTheory, false);
  await finish(s);
  await finish(await start("indefinite-articles", "learn", ai));
  const rebuilt = await progress("indefinite-articles");
  assert.equal(rebuilt.maintenanceStep, 0);
  assert.ok(rebuilt.maintenanceDueAt!.getTime() < Date.now() + day + 1000);

  // Two tabs and generation failures release locks, retaining the exact saved question/feedback.
  s = await start("article-negation", "revisit", ai);
  let release!: () => void;
  let entered!: () => void;
  const began = new Promise<void>((resolve) => { entered = resolve; });
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const slow: CurriculumAI = { ...ai, grade: async (...args) => { entered(); await blocked; return ai.grade(...args); } };
  const pending = answer(s, "correct", slow);
  await began;
  await assert.rejects(answer(s), TopicConflict);
  release(); s = await pending;
  s = await next(s);
  // Reach the end of the cached batch, then fail generation of the next one.
  for (let i = 0; i < 3; i++) s = await next(await answer(s));
  s = await answer(s);
  const failedGeneration: CurriculumAI = { ...ai, questions: async () => { throw new AllProvidersFailed([]); } };
  await assert.rejects(next(s, failedGeneration), AllProvidersFailed);
  assert.equal((await readTopicSession(s.id)).feedback?.submitted, "correct");
  const resumed = await next(s);
  assert.notEqual(resumed.question?.id, s.question?.id);
  assert.equal((await next(s)).question?.id, resumed.question?.id);
  console.log("Fable regressions passed: migrations, early leave, revisit maintenance, theory refresh, multi-tag dates, zero-weight retrieval, outages/denominators, gating, mixed validation, completed retries, oral/reveal, daily maintenance, two tabs and generation retries.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
