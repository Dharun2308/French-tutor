// Only run against a migrated disposable DB copy. All AI is injected or disabled.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "../src/lib/db/client";
import { cards, itemReviews, learningItems, phrases, settings } from "../src/lib/db/schema";
import { smartCandidates } from "../src/lib/smart/candidates";
import { smartAction, smartView, getSmartSession } from "../src/lib/smart/session";
import { smartSessions } from "../src/lib/smart/schema";
import { gradeSmartExercise, type SmartAI } from "../src/lib/smart/ai";
import type { SmartData, SmartSource } from "../src/lib/smart/types";
import { POST } from "../src/app/api/smart-session/route";

async function main() {
  assert.match(process.env.TURSO_DATABASE_URL ?? "", /^file:\/tmp\//);
  await db.update(settings).set({ activeTenses: ["present"], activeLevels: ["A1", "A2"], activePhraseCategories: ["phrase", "greeting", "article"], extractProviders: { codex: false, claude: false, openai: false } });
  await db.update(learningItems).set({ suspended: true });
  const [item] = await db.insert(learningItems).values({ french: "Je suis prêt.", english: "I am ready.", type: "phrase", normKey: randomUUID(), dueAt: new Date(0) }).returning();
  const candidates = await smartCandidates();
  const personal = candidates.find(c => c.kind === "personal" && c.id === item.id)!;
  const verb = candidates.find(c => c.kind === "verb")!;
  const phrase = candidates.find(c => c.kind === "phrase")!;
  assert.ok(personal && verb && phrase, "Mixed candidates honor active filters");
  assert.equal(candidates.filter(c => c.kind === "personal").length, 1);
  await db.insert(itemReviews).values({ itemId: item.id, rating: 2, direction: "production", ratedAt: new Date() });
  assert.ok(!(await smartCandidates()).some(c => c.key === personal.key), "Recent successful recall is cooled even if its due date is stale");
  await db.delete(itemReviews).where(eq(itemReviews.itemId, item.id));

  await db.update(smartSessions).set({ status: "abandoned" });
  const starts = await Promise.all(Array.from({ length: 4 }, () => smartAction({ action: "start" })));
  assert.equal(new Set(starts.map(s => s.id)).size, 1, "Concurrent starts share one session");
  const started = starts[0];
  assert.equal(started.question?.feedback, null);
  assert.ok(!JSON.stringify(started).includes(personal.target), "Unanswered targets are private");

  let sequence = 0;
  const create = async (sources: SmartSource[]) => {
    await db.update(smartSessions).set({ status: "abandoned" }).where(eq(smartSessions.status, "active"));
    const data: SmartData = { version: 1, sources, history: [], index: 0, queue: sources.map(s => ({ id: randomUUID(), sourceKey: s.key, followUp: false })) };
    return (await db.insert(smartSessions).values({ id: randomUUID(), status: "active", data }).returning())[0];
  };
  const read = async (id: string) => (await db.select().from(smartSessions).where(eq(smartSessions.id, id)))[0];
  const unavailable: SmartAI = { generate: async () => { throw new Error("offline"); }, grade: async () => { throw new Error("offline"); } };
  let generated = 0, graded = 0;
  const ai: SmartAI = {
    generate: async source => {
      generated++; sequence++;
      await new Promise(resolve => setTimeout(resolve, 5));
      return { prompt: `Write the complete sentence for exercise ${sequence}.`, target: `Je ${source.verb?.form ?? "suis prêt"} pour cet exercice numéro ${sequence}.`, rubric: "A fixture exercise.", provider: "fixture", fallback: false };
    },
    grade: async (_source, exercise, answer) => {
      graded++;
      return { verdict: answer === exercise.target ? "CORRECT" : "WRONG", corrected: exercise.target, explanation: "Use the requested grammar.", errorType: answer === exercise.target ? "none" : "agreement", provider: "fixture" };
    },
  };

  // Independent reviews across all three source types, and spaced follow-ups without SRS writes.
  const session = await create([personal, phrase, verb]);
  const firstId = session.data.queue[0].id;
  const preparations = await Promise.all(Array.from({ length: 4 }, () => smartAction({ action: "prepare", sessionId: session.id, questionId: firstId }, ai)));
  assert.equal(generated, 1);
  assert.ok(preparations.every(v => v.question?.prompt === preparations[0].question?.prompt));
  const submitted = await Promise.all(Array.from({ length: 4 }, () => smartAction({ action: "answer", sessionId: session.id, questionId: firstId, answer: "wrong", elapsedMs: 100 }, ai)));
  assert.equal(graded, 1);
  assert.equal(submitted[0].total, 4);
  assert.equal((await read(session.id)).data.queue[3].followUp, true);
  assert.equal((await db.select().from(itemReviews).where(eq(itemReviews.itemId, item.id))).length, 1);
  assert.equal((await getSmartSession())?.question?.feedback?.answer, "wrong", "Refresh restores saved feedback");
  const next = await Promise.all(Array.from({ length: 4 }, () => smartAction({ action: "next", sessionId: session.id, questionId: firstId }, ai)));
  assert.ok(next.every(v => v.completed === 1), "Repeated advance cannot skip the next question");

  for (const source of [phrase, verb]) {
    const current = await read(session.id);
    const questionId = current.data.queue[current.data.index].id;
    await smartAction({ action: "prepare", sessionId: session.id, questionId }, ai);
    const ready = await read(session.id);
    const target = ready.data.queue[ready.data.index].exercise!.target;
    const table = source.kind === "verb" ? cards : phrases;
    const [before] = await db.select().from(table).where(eq(table.id, source.id));
    await Promise.all([1, 2, 3].map(() => smartAction({ action: "answer", sessionId: session.id, questionId, answer: target, elapsedMs: 0 }, ai)));
    const [after] = await db.select().from(table).where(eq(table.id, source.id));
    assert.equal(after.correctCount, before.correctCount + 1);
    assert.ok(after.nextReviewAt > before.nextReviewAt);
    await smartAction({ action: "next", sessionId: session.id, questionId }, ai);
  }
  const follow = await read(session.id);
  const followId = follow.data.queue[follow.data.index].id;
  const [itemBeforeFollow] = await db.select().from(learningItems).where(eq(learningItems.id, item.id));
  await smartAction({ action: "prepare", sessionId: session.id, questionId: followId }, ai);
  const followReady = await read(session.id);
  await smartAction({ action: "answer", sessionId: session.id, questionId: followId, answer: followReady.data.queue[3].exercise!.target, elapsedMs: 0 }, ai);
  const complete = await smartAction({ action: "next", sessionId: session.id, questionId: followId }, ai);
  assert.equal(complete.status, "completed");
  assert.equal(complete.independent, 3);
  assert.equal(complete.correct, 2);
  assert.equal(complete.followUps, 1);
  assert.deepEqual((await db.select().from(learningItems).where(eq(learningItems.id, item.id)))[0], itemBeforeFollow);

  // Failed AI produces stable cards and UNGRADED feedback; self-rating is explicit/idempotent.
  const fallback = await create([personal]);
  const fallbackId = fallback.data.queue[0].id;
  const fallbackView = await smartAction({ action: "prepare", sessionId: fallback.id, questionId: fallbackId }, unavailable);
  assert.equal(fallbackView.question?.fallback, true);
  const generateCount = generated;
  await smartAction({ action: "prepare", sessionId: fallback.id, questionId: fallbackId }, ai);
  assert.equal(generated, generateCount, "Resume never swaps the prompt/target");
  const beforeUnscored = await db.select().from(learningItems).where(eq(learningItems.id, item.id));
  const ungraded = await smartAction({ action: "answer", sessionId: fallback.id, questionId: fallbackId, answer: "Maybe", elapsedMs: 0 }, unavailable);
  assert.equal(ungraded.question?.feedback?.grade.verdict, "UNGRADED");
  assert.equal(ungraded.question?.feedback?.rating, null);
  assert.deepEqual(await db.select().from(learningItems).where(eq(learningItems.id, item.id)), beforeUnscored);
  await assert.rejects(smartAction({ action: "next", sessionId: fallback.id, questionId: fallbackId }), /rate/);
  await Promise.all([1, 2, 3].map(() => smartAction({ action: "rate", sessionId: fallback.id, questionId: fallbackId, rating: 2 })));
  const manual = await db.select().from(itemReviews).where(and(eq(itemReviews.itemId, item.id), eq(itemReviews.gradedBy, "manual")));
  assert.equal(manual.length, 1);

  // Actual local exact grading remains available with all AI providers disabled.
  const exact = await gradeSmartExercise(personal, { prompt: personal.prompt, target: personal.target, rubric: "", provider: "original", fallback: true }, "  Je suis prêt  ");
  assert.equal(exact.provider, "local");
  assert.equal(exact.verdict, "CORRECT");

  // Cross-worker revision races roll back scheduling; they cannot resurrect abandoned rounds.
  const racing = await create([personal]);
  const raceId = racing.data.queue[0].id;
  await smartAction({ action: "prepare", sessionId: racing.id, questionId: raceId }, ai);
  const beforeRace = await db.select().from(learningItems).where(eq(learningItems.id, item.id));
  await assert.rejects(smartAction({ action: "answer", sessionId: racing.id, questionId: raceId, answer: "wrong", elapsedMs: 0 }, {
    ...ai, grade: async (...args) => {
      await db.update(smartSessions).set({ revision: sql`${smartSessions.revision} + 1`, status: "abandoned" }).where(eq(smartSessions.id, racing.id));
      return ai.grade(...args);
    },
  }), /changed/);
  assert.deepEqual(await db.select().from(learningItems).where(eq(learningItems.id, item.id)), beforeRace);
  assert.equal((await read(racing.id)).data.queue[0].attempt, undefined);

  const suspended = await create([personal]);
  const suspendedId = suspended.data.queue[0].id;
  await smartAction({ action: "prepare", sessionId: suspended.id, questionId: suspendedId }, ai);
  await db.update(learningItems).set({ suspended: true }).where(eq(learningItems.id, item.id));
  await assert.rejects(smartAction({ action: "answer", sessionId: suspended.id, questionId: suspendedId, answer: "wrong", elapsedMs: 0 }, ai), /suspended/);
  assert.equal((await read(suspended.id)).data.queue[0].attempt, undefined, "A refused review also rolls back session feedback");
  const skipped = await smartAction({ action: "skip", sessionId: suspended.id, questionId: suspendedId });
  assert.equal(skipped.skipped, 1);
  const retired = await create([personal]);
  const retiredView = await smartAction({ action: "prepare", sessionId: retired.id, questionId: retired.data.queue[0].id }, ai);
  assert.equal(retiredView.status, "completed");
  assert.equal(retiredView.independent, 0);

  const invalid = await POST(new NextRequest("http://localhost/api/smart-session", { method: "POST", body: JSON.stringify({ action: "answer", sessionId: session.id, questionId: firstId, answer: " ", elapsedMs: -1 }) }));
  assert.equal(invalid.status, 400);
  assert.equal(smartView(await read(session.id)).question, null);
  console.log("Passed: mixed selection, cooldown, private answers, concurrent starts/generation/grading/advance, all three review schedules, durable feedback, bounded follow-ups, offline/manual grading, suspension and atomic race rollback.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
