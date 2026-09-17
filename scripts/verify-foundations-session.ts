// Run against a migrated disposable DB copy, never the live database. No real AI calls.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "../src/lib/db/client";
import { itemReviews, learningItems, phrases, settings } from "../src/lib/db/schema";
import { foundationsCandidates } from "../src/lib/foundations/candidates";
import { FoundationsConflict, foundationsAction, getFoundationsSession } from "../src/lib/foundations/session";
import { foundationsReviews, foundationsSessions } from "../src/lib/foundations/schema";
import type { FoundationsAI } from "../src/lib/foundations/ai";
import type { FoundationsData, FoundationsSource } from "../src/lib/foundations/types";
import { POST } from "../src/app/api/foundations-session/route";
import type { Rating } from "../src/types";

async function main() {
  assert.match(process.env.TURSO_DATABASE_URL ?? "", /^file:\/tmp\//);
  await db.delete(foundationsReviews);
  await db.update(settings).set({ activeTenses: ["present"], activeLevels: ["A1"], activePhraseCategories: ["phrase"], extractProviders: { codex: false, claude: false, openai: false } });
  await db.update(learningItems).set({ suspended: true });
  await db.update(phrases).set({ suspended: true });
  const [item] = await db.insert(learningItems).values({ french: "du pain", english: "some bread", type: "vocabulary", cefrLevel: "A1", exampleFr: "J’achète du pain pour mes amis avant de préparer le repas.", exampleEn: "I buy bread for my friends before preparing the meal.", normKey: randomUUID(), dueAt: new Date(0) }).returning();
  const [advanced] = await db.insert(learningItems).values({ french: "renvoyer", english: "send back", type: "vocabulary", cefrLevel: "B1", failureCount: 20, reviewCount: 20, priority: 5, normKey: randomUUID(), dueAt: new Date(0) }).returning();
  const [phrase] = await db.insert(phrases).values({ french: "un café", english: "a coffee", category: "phrase", level: "A1", frequencyRank: 1, nextReviewAt: new Date(0), wrongCount: 3, repetitions: 0 }).returning();
  const [filtered] = await db.insert(phrases).values({ french: "un thé", english: "a tea", category: "food", level: "A2", frequencyRank: 1, nextReviewAt: new Date(0) }).returning();
  const plan = await foundationsCandidates();
  assert.equal(plan.sources.length, 2);
  assert.ok(!plan.sources.some(s => s.id === filtered.id && s.kind === "phrase"));
  assert.ok(!plan.sources.some(s => s.key === `personal:${advanced.id}`), "The reported B1 vocabulary must stay out even with many misses");
  const personal = plan.sources.find(s => s.kind === "personal")!, everyday = plan.sources.find(s => s.kind === "phrase")!;
  assert.equal(personal.target, "du pain", "Foundations uses the basic word group rather than the longer tutor example");
  assert.equal(personal.prompt, "some bread");
  assert.equal(plan.sources[0].key, everyday.key, "Legacy Again cards are reviewed struggles even with zero repetitions");
  assert.equal(everyday.challenge, "supported");
  await db.insert(itemReviews).values({ itemId: item.id, rating: 2, direction: "production", ratedAt: new Date() });
  assert.ok(!(await foundationsCandidates()).sources.some(s => s.key === personal.key));
  await db.delete(itemReviews).where(eq(itemReviews.itemId, item.id));

  await db.update(foundationsSessions).set({ status: "abandoned" });
  const starts = await Promise.all(Array.from({ length: 4 }, () => foundationsAction({ action: "start", mix: "blend" })));
  assert.equal(new Set(starts.map(s => s.id)).size, 1);
  assert.ok(!JSON.stringify(starts[0]).includes(everyday.target), "Answers remain private");
  const read = async (id: string) => (await db.select().from(foundationsSessions).where(eq(foundationsSessions.id, id)))[0];
  const readItem = async () => (await db.select().from(learningItems).where(eq(learningItems.id, item.id)))[0];
  const readPhrase = async () => (await db.select().from(phrases).where(eq(phrases.id, phrase.id)))[0];
  const reviewCount = async () => (await db.select().from(foundationsReviews)).length;
  const create = async (sources: FoundationsSource[]) => {
    await db.update(foundationsSessions).set({ status: "abandoned" }).where(eq(foundationsSessions.status, "active"));
    const data: FoundationsData = { version: 2, mix: "blend", activeTenses: ["present"], sources, history: [], index: 0, queue: sources.map(s => ({ id: randomUUID(), sourceKey: s.key, followUp: false })) };
    return (await db.insert(foundationsSessions).values({ id: randomUUID(), status: "active", data }).returning())[0];
  };
  let generated = 0, graded = 0;
  const ai: FoundationsAI = {
    generate: async source => ({ prompt: `Translate: I prepare it. (Exercise ${++generated}.)`, target: `Je prépare ${source.target}.`, rubric: "Partitive article in a short sentence.", provider: "fixture", fallback: false }),
    grade: async (_source, exercise, answer) => {
      graded++;
      return { verdict: answer === exercise.target ? "CORRECT" : "WRONG", corrected: exercise.target, explanation: "Use the requested grammar.", errorType: answer === exercise.target ? "none" : "article", provider: "fixture" };
    },
  };
  const offline: FoundationsAI = { generate: async () => { throw Error("offline"); }, grade: async () => { throw Error("offline"); } };

  // Grading and refresh do not rate the learner. The explicit rating is atomic/idempotent.
  const session = await create([personal, everyday]);
  const firstId = session.data.queue[0].id;
  const identity = { sessionId: session.id, questionId: firstId };
  const preparations = await Promise.all(Array.from({ length: 4 }, () => foundationsAction({ action: "prepare", ...identity }, ai)));
  assert.equal(generated, 1);
  assert.equal(preparations[0].question?.fallback, false);
  assert.ok(preparations.every(v => v.question?.prompt === preparations[0].question?.prompt));
  const beforeGrade = await readItem();
  const ungraded = await Promise.all(Array.from({ length: 4 }, () => foundationsAction({ action: "answer", ...identity, answer: "wrong", elapsedMs: 100 }, ai)));
  assert.equal(graded, 1);
  assert.equal(ungraded[0].question?.feedback?.rating, null);
  assert.deepEqual(await readItem(), beforeGrade);
  assert.equal(await reviewCount(), 0);
  assert.equal((await getFoundationsSession())?.question?.feedback?.answer, "wrong");
  const rated = await Promise.all(Array.from({ length: 4 }, () => foundationsAction({ action: "rate", ...identity, rating: 0 })));
  assert.ok(rated.every(s => s.completed === 1));
  assert.equal((await readItem()).reviewCount, beforeGrade.reviewCount + 1);
  assert.equal((await readItem()).failureCount, beforeGrade.failureCount + 1);
  assert.equal(await reviewCount(), 1);
  assert.equal((await db.select().from(itemReviews).where(eq(itemReviews.itemId, item.id))).length, 1);

  const current = await read(session.id), secondId = current.data.queue[1].id;
  await foundationsAction({ action: "prepare", sessionId: session.id, questionId: secondId }, ai);
  await foundationsAction({ action: "reveal", sessionId: session.id, questionId: secondId });
  const phraseBefore = await readPhrase();
  await foundationsAction({ action: "rate", sessionId: session.id, questionId: secondId, rating: 3 });
  const phraseAfter = await readPhrase();
  assert.equal(phraseAfter.correctCount, phraseBefore.correctCount + 1);
  assert.ok(phraseAfter.nextReviewAt.getTime() >= Date.now() + 3.9 * 86_400_000);
  const follow = await read(session.id), followId = follow.data.queue[2].id;
  assert.equal(follow.data.queue[2].followUp, true);
  assert.deepEqual(follow.data.queue[2].exercise, follow.data.queue[0].exercise);
  const beforeFollow = await readItem();
  await foundationsAction({ action: "answer", sessionId: session.id, questionId: followId, answer: follow.data.queue[2].exercise!.target, elapsedMs: 0 }, ai);
  const complete = await foundationsAction({ action: "rate", sessionId: session.id, questionId: followId, rating: 2 });
  assert.equal(complete.status, "completed");
  assert.deepEqual(complete.ratings, { 0: 1, 1: 0, 2: 0, 3: 1 });
  assert.equal(complete.followUps, 1);
  assert.deepEqual(await readItem(), beforeFollow, "A prompted same-round success must not replace the original lapse");
  const saved = await db.select().from(foundationsReviews).where(eq(foundationsReviews.sessionId, session.id)).orderBy(foundationsReviews.id);
  assert.deepEqual(saved.map(r => [r.rating, r.independent]), [[0, true], [3, true], [2, false]]);
  assert.equal((await getFoundationsSession())?.status, "completed");
  assert.equal(complete.recap[0].french, follow.data.queue[0].exercise!.target);

  // The next eligible round remembers the exact missed sentence, not just its original word.
  const tomorrow = new Date(Date.now() + 2 * 86_400_000);
  const again = (await foundationsCandidates("blend", tomorrow)).sources.find(s => s.key === personal.key)!;
  assert.equal(again.memory.again, 1);
  assert.equal(again.memory.good, 0, "Relearning cannot inflate independent memory");
  assert.deepEqual(again.retryExercise, follow.data.queue[0].exercise);
  assert.ok(!(await foundationsCandidates()).sources.some(s => s.key === everyday.key), "Easy leaves the due pool");

  // Every self-rating survives subsequent round planning, including fresh contexts after success.
  for (const rating of [0, 1, 2, 3] as Rating[]) {
    const round = await create([everyday]), questionId = round.data.queue[0].id;
    await foundationsAction({ action: "prepare", sessionId: round.id, questionId }, ai);
    await foundationsAction({ action: "reveal", sessionId: round.id, questionId });
    await foundationsAction({ action: "rate", sessionId: round.id, questionId, rating });
    const later = new Date(Date.now() + 400 * 86_400_000);
    const next = (await foundationsCandidates("everyday", later)).sources.find(s => s.key === everyday.key)!;
    assert.equal(next.memory.lastRating, rating);
    assert.equal(!!next.retryExercise, rating < 2);
  }

  // Fallback stays stable. Failed grading still permits all manual ratings without guessed mastery.
  const fallback = await create([personal]), fallbackId = fallback.data.queue[0].id;
  const fallbackView = await foundationsAction({ action: "prepare", sessionId: fallback.id, questionId: fallbackId }, offline);
  assert.equal(fallbackView.question?.fallback, true);
  const generateCount = generated;
  await foundationsAction({ action: "prepare", sessionId: fallback.id, questionId: fallbackId }, ai);
  assert.equal(generated, generateCount);
  const beforeOffline = await readItem();
  const result = await foundationsAction({ action: "answer", sessionId: fallback.id, questionId: fallbackId, answer: "Maybe", elapsedMs: 0 }, offline);
  assert.equal(result.question?.feedback?.grade.verdict, "UNGRADED");
  assert.deepEqual(await readItem(), beforeOffline);
  await foundationsAction({ action: "rate", sessionId: fallback.id, questionId: fallbackId, rating: 1 });
  assert.equal((await readItem()).failureCount, beforeOffline.failureCount + 1);

  // A source edited after feedback refuses the review and rolls back all rating/session writes.
  const edited = await create([personal]), editedId = edited.data.queue[0].id;
  await foundationsAction({ action: "prepare", sessionId: edited.id, questionId: editedId }, ai);
  await foundationsAction({ action: "reveal", sessionId: edited.id, questionId: editedId });
  await db.update(learningItems).set({ french: "du riz" }).where(eq(learningItems.id, item.id));
  const beforeRefused = await read(edited.id), historyCount = await reviewCount(), beforeRefusedItem = await readItem();
  await assert.rejects(foundationsAction({ action: "rate", sessionId: edited.id, questionId: editedId, rating: 2 }), FoundationsConflict);
  assert.deepEqual(await read(edited.id), beforeRefused);
  assert.deepEqual(await readItem(), beforeRefusedItem);
  assert.equal(await reviewCount(), historyCount);
  await foundationsAction({ action: "skip", sessionId: edited.id, questionId: editedId });
  assert.equal(await reviewCount(), historyCount);
  await db.update(learningItems).set({ french: item.french }).where(eq(learningItems.id, item.id));

  // Cross-worker changes cannot overwrite progress or resurrect an abandoned session.
  const racing = await create([personal]), raceId = racing.data.queue[0].id;
  await assert.rejects(foundationsAction({ action: "prepare", sessionId: racing.id, questionId: raceId }, {
    ...ai, generate: async (...args) => {
      await db.update(foundationsSessions).set({ revision: sql`${foundationsSessions.revision} + 1`, status: "abandoned" }).where(eq(foundationsSessions.id, racing.id));
      return ai.generate(...args);
    },
  }), /changed/);
  assert.equal((await read(racing.id)).data.queue[0].exercise, undefined);
  const suspended = await create([personal]);
  await db.update(learningItems).set({ suspended: true }).where(eq(learningItems.id, item.id));
  const retired = await foundationsAction({ action: "prepare", sessionId: suspended.id, questionId: suspended.data.queue[0].id }, ai);
  assert.equal(retired.status, "completed");
  assert.equal(retired.skipped, 1);
  assert.equal(await reviewCount(), historyCount);
  const invalid = await POST(new NextRequest("http://localhost/api/foundations-session", { method: "POST", body: JSON.stringify({ action: "answer", ...identity, answer: " ", elapsedMs: -1 }) }));
  assert.equal(invalid.status, 400);
  const independent = await db.select().from(foundationsReviews).where(and(eq(foundationsReviews.sourceKey, personal.key), eq(foundationsReviews.independent, true)));
  assert.equal(independent.length, 2);

  // Earlier complex rounds and saved exercises cannot bypass the new beginner limits.
  const old = await create([everyday]);
  old.data.version = 1;
  const oldExercise = { prompt: "You and your partner bought shoes online. Say that you can send these shoes back by mail.", target: "Nous pouvons renvoyer ces chaussures par la poste.", rubric: "A previous advanced question.", provider: "fixture", fallback: false };
  old.data.queue[0].exercise = oldExercise;
  await db.update(foundationsSessions).set({ data: old.data }).where(eq(foundationsSessions.id, old.id));
  await db.insert(foundationsReviews).values({ sessionId: old.id, questionId: old.data.queue[0].id, sourceKey: everyday.key, rating: 0, independent: true, exercise: oldExercise, answer: "", grade: { verdict: "UNGRADED", corrected: oldExercise.target, explanation: "Old feedback", errorType: "none", provider: "self" }, ratedAt: new Date() });
  await db.update(phrases).set({ nextReviewAt: new Date(0) }).where(eq(phrases.id, phrase.id));
  const preservedReviews = await db.select().from(foundationsReviews);
  const preservedItem = await readItem(), preservedPhrase = await readPhrase();
  assert.equal(await getFoundationsSession(), null, "Reload should request an easier round instead of resuming the advanced one");
  const replacement = await foundationsAction({ action: "start", mix: "blend" });
  assert.notEqual(replacement.id, old.id);
  assert.equal((await read(old.id)).status, "abandoned");
  assert.equal((await read(replacement.id)).data.version, 2);
  assert.equal(replacement.question?.prompt, null, "An advanced cached exercise must be regenerated");
  assert.equal(replacement.question?.memory.lastRating, 0, "Its actual rating is still remembered");
  assert.deepEqual(await db.select().from(foundationsReviews), preservedReviews);
  assert.deepEqual(await readItem(), preservedItem);
  assert.deepEqual(await readPhrase(), preservedPhrase);
  await assert.rejects(foundationsAction({ action: "rate", sessionId: old.id, questionId: old.data.queue[0].id, rating: 2 }), /easier/);
  console.log("Passed: mixed/filtered selection, old misses, cooldown, concurrent starts/preparation/answers/ratings, explicit four-rating memory, both source schedules, exact-sentence retries, fresh contexts after success, reload, independent follow-ups, offline recovery, edited/suspended sources, atomic rollback and cross-worker conflicts.");
  console.log("Passed: B1 exclusion, basic note expressions, replacing obsolete rounds and discarding advanced retry text without changing saved ratings or schedules.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
