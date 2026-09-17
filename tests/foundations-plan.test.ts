import assert from "node:assert/strict";
import { test } from "node:test";
import { challengeFor, foundationsSchedule, recallMemory, reinforce, selectFoundations } from "../src/lib/foundations/plan";
import { foundationsExerciseSchema } from "../src/lib/foundations/exercise";
import { foundationsCard, isFoundationsSource } from "../src/lib/foundations/level";
import type { FoundationsData, FoundationsSource } from "../src/lib/foundations/types";
import type { Rating } from "../src/types";

const now = new Date("2026-09-15T12:00:00Z");
const source = (kind: "phrase" | "personal", id: number, score = id): FoundationsSource => ({
  kind, id, key: `${kind}:${id}`, group: kind, score, level: "A1", label: kind,
  reason: "Due", prompt: `Expression ${id}`, target: `${kind} ${id}`, topic: "agreement", evidence: [],
  dueAt: new Date(0).toISOString(), reviewed: false, memory: recallMemory([]), challenge: "standard",
});

test("Foundations blends notes and broader French, prioritizing due struggles even when repetitions reset", () => {
  const notes = Array.from({ length: 16 }, (_, id) => ({ ...source("personal", id, 1000 - id), reviewed: true }));
  const everyday = Array.from({ length: 12 }, (_, id) => source("phrase", id));
  const missed = { ...everyday[0], score: 2000, reviewed: true, memory: recallMemory([{ rating: 0, ratedAt: now }]) };
  const future = { ...source("phrase", 99, 9000), dueAt: new Date(now.getTime() + 60_000).toISOString() };
  const result = selectFoundations([...notes, ...everyday.slice(1), missed, future], "blend", 12, now);
  assert.equal(result[0].key, missed.key);
  assert.equal(result.filter(s => s.kind === "personal").length, 6);
  assert.equal(result.filter(s => s.kind === "phrase").length, 6);
  assert.ok(!result.some(s => s.key === future.key));
  assert.equal(new Set(result.map(s => s.key)).size, 12);
  assert.equal(selectFoundations(notes, "blend", 12, now).length, 12, "A missing origin does not block practice");
  assert.ok(selectFoundations([...notes, ...everyday], "notes", 12, now).every(s => s.kind === "personal"));
  assert.ok(selectFoundations([...notes, ...everyday], "everyday", 12, now).every(s => s.kind === "phrase"));
  const duplicate = { ...source("personal", 90), target: missed.target.toUpperCase() };
  assert.equal(selectFoundations([missed, duplicate], "blend", 12, now).length, 1);
});

test("Recall memory preserves all four ratings and adjusts challenge from repeated recent difficulty", () => {
  const reviews = ([0, 1, 3, 2, 1, 3] as Rating[]).map((rating, i) => ({ rating, ratedAt: new Date(now.getTime() + i * 1000) }));
  const memory = recallMemory(reviews);
  assert.deepEqual(memory, { again: 1, hard: 2, good: 1, easy: 2, recentStruggles: 2, lastRating: 3 });
  assert.equal(challengeFor(memory, 0), "supported");
  assert.equal(challengeFor(recallMemory([]), 2), "supported", "Legacy misses still count");
  assert.equal(challengeFor(recallMemory([{ rating: 3, ratedAt: now }, { rating: 3, ratedAt: now }]), 100), "stretch", "Old mistakes do not override recent improvement");
  assert.equal(challengeFor(recallMemory([]), 0), "standard");
});

test("Again, Hard, Good and Easy schedule differently; Hard does not count as mastery", () => {
  const state = { easeX100: 250, intervalDays: 0, repetitions: 0, nextReviewAt: now, lastReviewedAt: null };
  const next = ([0, 1, 2, 3] as Rating[]).map(rating => foundationsSchedule(state, rating, 0, now));
  assert.deepEqual(next.map(s => s.nextReviewAt.getTime() - now.getTime()), [600_000, 1_800_000, 86_400_000, 345_600_000]);
  assert.equal(next[1].repetitions, 0);
  const mature = { ...state, intervalDays: 30, repetitions: 10 };
  assert.equal(foundationsSchedule(mature, 1, 0, now).intervalDays, 1);
  assert.equal(foundationsSchedule(mature, 1, 2, now).nextReviewAt.getTime() - now.getTime(), 1_800_000);
  assert.equal(foundationsSchedule(mature, 2, 3, now).intervalDays, 1, "Repeated misses need another independent success soon");
  assert.ok(foundationsSchedule(mature, 3, 0, now).intervalDays > 30);
});

test("Relearning preserves the missed sentence, waits two questions and stays bounded", () => {
  const exercise = { prompt: "I buy some bread at the bakery.", target: "J’achète du pain à la boulangerie.", rubric: "Partitive article", provider: "fixture", fallback: false };
  const data: FoundationsData = { version: 1, mix: "blend", activeTenses: ["present"], sources: [], history: [], index: 0, queue: Array.from({ length: 6 }, (_, i) => ({
    id: `q${i}`, sourceKey: `personal:${i}`, followUp: false, exercise,
    feedback: { answer: "wrong", rating: 1, revealed: false, elapsedMs: 0, dueAt: null, grade: { verdict: "WRONG", corrected: exercise.target, explanation: "Rule", errorType: "article", provider: "fixture" } },
  })) };
  assert.equal(reinforce(data, "q0", "retry0"), true);
  assert.equal(data.queue[3].id, "retry0");
  assert.deepEqual(data.queue[3].exercise, exercise);
  assert.equal(reinforce(data, "q0", "duplicate"), false);
  assert.equal(reinforce(data, "retry0", "recursive"), false);
  assert.equal(reinforce(data, "q1", "retry1"), true);
  assert.equal(reinforce(data, "q2", "retry2"), true);
  assert.equal(reinforce(data, "q3", "retry3"), false);
  data.queue[0].feedback!.rating = null;
  assert.equal(reinforce(data, "q0", "unrated"), false);
});

test("Beginner eligibility beats weakness scores and uses the basic note expression", () => {
  const basic = source("personal", 1);
  const advanced = { ...source("personal", 26, 99999), level: "B1", target: "renvoyer", prompt: "to send back", challenge: "supported" as const };
  const intermediate = { ...source("phrase", 2, 99999), level: "A2" };
  assert.deepEqual(selectFoundations([advanced, intermediate, basic], "blend", 12, now).map(s => s.key), [basic.key]);
  assert.equal(isFoundationsSource({ ...basic, target: "Un deux trois quatre cinq six sept huit neuf" }), false);
  const note = { french: "du pain", english: "some bread", exampleFr: "Une longue histoire avec plusieurs actions dans le passé.", exampleEn: "A long past-tense story." };
  assert.deepEqual(foundationsCard(note), { promptEn: "some bread", targetFr: "du pain" });
});

test("Generated Foundations accept basic words and small variations, rejecting long scenarios and leaked answers", () => {
  const original = { ...source("phrase", 1), prompt: "I buy bread every morning.", target: "J’achète du pain chaque matin." };
  const schema = foundationsExerciseSchema(original, [{ prompt: "Translate: I eat bread at home.", target: "Je mange du pain à la maison." }]);
  const valid = { sourceKey: original.key, prompt: "Translate: I buy some bread.", target: "J’achète du pain.", rubric: "Use the partitive article." };
  assert.equal(schema.safeParse(valid).success, true);
  for (const invalid of [
    { ...valid, sourceKey: "phrase:999" },
    { ...valid, prompt: `Translate: ${valid.target}` },
    { ...valid, prompt: "Translate: I eat bread at home.", target: "JE MANGE DU PAIN À LA MAISON!" },
    { ...valid, target: "J’achète du pain pour ma sœur puis nous préparons le déjeuner." },
    { ...valid, prompt: "You and your partner bought shoes online. Say that you can send these shoes back by mail.", target: "Nous pouvons renvoyer ces chaussures par la poste." },
  ]) assert.equal(schema.safeParse(invalid).success, false);
  assert.equal(schema.safeParse({ ...valid, target: "Aujourd’hui, j’achète du pain chaque matin." }).success, true, "Small beginner variations are allowed");
  const word = { ...source("personal", 2), target: "de l’eau" };
  const wordSchema = foundationsExerciseSchema(word, []);
  assert.equal(wordSchema.safeParse({ ...valid, sourceKey: word.key, target: "Je bois de l’eau avec mon repas." }).success, true);
  assert.equal(wordSchema.safeParse({ ...valid, sourceKey: word.key, target: "J’ajoute de l’huile dans la salade." }).success, false, "A related grammar rule cannot replace the actual word being learned");
  assert.equal(wordSchema.safeParse({ ...valid, sourceKey: word.key, prompt: "Translate: Some water.", target: "De l’eau." }).success, true);
  const article = { ...word, target: "le" };
  assert.equal(foundationsExerciseSchema(article, []).safeParse({ ...valid, sourceKey: article.key, prompt: "Translate: The (masculine).", target: "le" }).success, true);
});
