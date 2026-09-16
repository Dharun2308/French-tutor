// Disposable migrated DB only. Prepares deterministic full sentences plus one provider fallback.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { learningItems, phrases, settings } from "../src/lib/db/schema";
import { foundationsCandidates } from "../src/lib/foundations/candidates";
import { foundationsSessions } from "../src/lib/foundations/schema";
import type { FoundationsData } from "../src/lib/foundations/types";

async function main() {
  assert.match(process.env.TURSO_DATABASE_URL ?? "", /^file:\/tmp\//);
  await db.update(settings).set({ extractProviders: { codex: false, claude: false, openai: false }, activePhraseCategories: ["phrase"], activeLevels: ["A1"] });
  await db.update(learningItems).set({ suspended: true });
  await db.update(phrases).set({ suspended: true });
  const notes = await db.insert(learningItems).values([
    { french: "du pain", english: "some bread", type: "vocab" as const, normKey: randomUUID(), dueAt: new Date(0) },
    { french: "Je suis prêt.", english: "I am ready.", type: "phrase" as const, normKey: randomUUID(), dueAt: new Date(0) },
  ]).returning();
  const everyday = await db.insert(phrases).values([
    { french: "un café", english: "a coffee", category: "phrase", level: "A1", frequencyRank: 1, nextReviewAt: new Date(0) },
    { french: "une voiture", english: "a car", category: "phrase", level: "A1", frequencyRank: 2, nextReviewAt: new Date(0) },
  ]).returning();
  const plan = await foundationsCandidates();
  const keys = [`personal:${notes[0].id}`, `phrase:${everyday[0].id}`, `personal:${notes[1].id}`, `phrase:${everyday[1].id}`];
  const sources = keys.map(key => plan.sources.find(s => s.key === key)!);
  assert.ok(sources.every(Boolean));
  const exercises = [
    { prompt: "Write in French: I buy some bread for my sister.", target: "J’achète du pain pour ma sœur." },
    undefined,
    { prompt: "Write in French, as a man: I am ready to leave with my friends.", target: "Je suis prêt à partir avec mes amis." },
    { prompt: "Write in French: We have a car for the trip.", target: "Nous avons une voiture pour le voyage." },
  ];
  await db.update(foundationsSessions).set({ status: "abandoned" }).where(eq(foundationsSessions.status, "active"));
  const data: FoundationsData = { version: 1, mix: "blend", sources, history: [], activeTenses: ["present"], index: 0,
    queue: sources.map((source, index) => ({ id: randomUUID(), sourceKey: source.key, followUp: false, exercise: exercises[index] ? { ...exercises[index]!, rubric: "Use natural everyday French.", provider: "fixture", fallback: false } : undefined })) };
  await db.insert(foundationsSessions).values({ id: randomUUID(), status: "active", data });
  console.log("Foundations browser fixture ready: four independent questions, providers disabled.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
