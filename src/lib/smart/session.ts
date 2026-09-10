import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { cards, conjugations, learningItems, phrases, verbs } from "@/lib/db/schema";
import { getSettings } from "@/lib/api";
import { cardFor } from "@/lib/items/card";
import { recordItemReview, type ReviewTransaction } from "@/lib/items/review";
import { ensureSeeded } from "@/lib/seed/ensure-seeded";
import { applyRating } from "@/lib/srs";
import { RATINGS } from "@/types";
import { smartAI, type SmartAI } from "./ai";
import { smartCandidates } from "./candidates";
import { smartExerciseSchema } from "./exercise";
import { addSmartFollowUp } from "./plan";
import { smartSessions } from "./schema";
import type { SmartData, SmartQuestion, SmartSource, SmartView } from "./types";

const identity = { sessionId: z.string().uuid(), questionId: z.string().uuid() };
export const SmartActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), restart: z.boolean().optional() }),
  z.object({ action: z.literal("prepare"), ...identity }),
  z.object({ action: z.literal("answer"), ...identity, answer: z.string().trim().min(1).max(500), elapsedMs: z.number().int().min(0).max(3_600_000).default(0) }),
  z.object({ action: z.literal("rate"), ...identity, rating: z.union([z.literal(RATINGS[0]), z.literal(RATINGS[1]), z.literal(RATINGS[2]), z.literal(RATINGS[3])]) }),
  z.object({ action: z.literal("next"), ...identity }),
  z.object({ action: z.literal("skip"), ...identity }),
]);
export type SmartAction = z.infer<typeof SmartActionSchema>;
type Session = typeof smartSessions.$inferSelect;

export class SmartConflict extends Error {}

// Deduplicate costly calls in one process; the revision check also guards other workers.
declare global { var __smartSessionLock: Promise<void> | undefined; }
async function locked<T>(work: () => Promise<T>): Promise<T> {
  const previous = globalThis.__smartSessionLock ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  globalThis.__smartSessionLock = current;
  await previous;
  try { return await work(); }
  finally { release(); }
}

export function smartView(session: Session): SmartView {
  const { data } = session;
  const question = data.queue[data.index];
  const source = question && data.sources.find(s => s.key === question.sourceKey);
  const independent = data.queue.filter(q => !q.followUp && q.attempt?.rating != null && !q.skipped);
  return {
    id: session.id, status: session.status, completed: data.index, total: data.queue.length,
    independent: independent.length, correct: independent.filter(q => q.attempt!.rating! >= 2).length,
    followUps: data.queue.filter(q => q.followUp && q.attempt?.rating != null).length,
    skipped: data.queue.filter(q => q.skipped).length,
    focus: [...new Set(data.sources.map(s => s.reason))].slice(0, 3),
    question: question && source ? {
      id: question.id, label: source.label, reason: question.followUp ? "Try the missed skill in a different situation" : source.reason,
      followUp: question.followUp, prompt: question.exercise?.prompt ?? null,
      provider: question.exercise?.provider ?? null, fallback: question.exercise?.fallback ?? false,
      feedback: question.attempt ? { ...question.attempt, modelAnswer: question.exercise!.target } : null,
    } : null,
    recap: data.queue.filter(q => q.attempt && !q.skipped && (q.attempt.grade.verdict === "WRONG" || q.attempt.grade.verdict === "MINOR_ERROR" || (q.attempt.rating != null && q.attempt.rating < 2)))
      .slice(0, 6).map(q => ({ label: data.sources.find(s => s.key === q.sourceKey)!.label, correction: q.attempt!.grade.corrected, explanation: q.attempt!.grade.explanation })),
  };
}

export async function getSmartSession(): Promise<SmartView | null> {
  const [active] = await db.select().from(smartSessions).where(eq(smartSessions.status, "active")).limit(1);
  const [completed] = active ? [] : await db.select().from(smartSessions).where(eq(smartSessions.status, "completed")).orderBy(desc(smartSessions.createdAt)).limit(1);
  return active || completed ? smartView(active ?? completed) : null;
}

async function available(source: SmartSource, tx: ReviewTransaction | typeof db = db): Promise<boolean> {
  const settings = await getSettings();
  if (source.kind === "personal") {
    const [item] = await tx.select().from(learningItems).where(eq(learningItems.id, source.id));
    return !!item && !item.suspended && cardFor(item).targetFr === source.target;
  }
  if (source.kind === "phrase") {
    const [phrase] = await tx.select().from(phrases).where(eq(phrases.id, source.id));
    return !!phrase && !phrase.suspended && phrase.french === source.target && settings.activePhraseCategories.includes(phrase.category) && settings.activeLevels.includes(phrase.level);
  }
  const [row] = await tx.select({ card: cards, conjugation: conjugations, verb: verbs }).from(cards)
    .innerJoin(conjugations, eq(conjugations.id, cards.conjugationId)).innerJoin(verbs, eq(verbs.id, conjugations.verbId))
    .where(eq(cards.id, source.id));
  return !!row && !row.card.suspended && row.conjugation.form === source.target && settings.activeTenses.includes(row.conjugation.tense) && settings.activeLevels.includes(row.verb.level);
}

async function recordReview(tx: ReviewTransaction, source: SmartSource, question: SmartQuestion, sessionId: string) {
  if (!await available(source, tx)) throw new SmartConflict("This card was edited, suspended or removed from practice. Skip it to continue.");
  const attempt = question.attempt!;
  const rating = attempt.rating!;
  const now = new Date();
  if (source.kind === "personal") {
    await recordItemReview(tx, {
      requestId: `smart:${sessionId}:${question.id}`, itemId: source.id, rating, direction: "production",
      verdict: attempt.grade.verdict, errorType: attempt.grade.errorType,
      userAnswer: attempt.answer, correctedAnswer: attempt.grade.corrected, gradeReason: attempt.grade.explanation,
      elapsedMs: attempt.elapsedMs, gradedBy: attempt.grade.verdict === "UNGRADED" ? "manual" : attempt.grade.provider,
    }, now);
    return;
  }
  const table = source.kind === "verb" ? cards : phrases;
  const [row] = await tx.select().from(table).where(eq(table.id, source.id));
  const next = applyRating({ easeX100: row.easeFactor, intervalDays: row.intervalDays, repetitions: row.repetitions, nextReviewAt: row.nextReviewAt, lastReviewedAt: row.lastReviewedAt }, rating, now);
  await tx.update(table).set({
    easeFactor: next.easeX100, intervalDays: next.intervalDays, repetitions: next.repetitions,
    nextReviewAt: next.nextReviewAt, lastReviewedAt: next.lastReviewedAt,
    correctCount: row.correctCount + (rating >= 2 ? 1 : 0), wrongCount: row.wrongCount + (rating >= 2 ? 0 : 1),
  }).where(eq(table.id, source.id));
}

async function persist(session: Session, data: SmartData, review?: SmartQuestion): Promise<Session> {
  const status = data.index >= data.queue.length ? "completed" : "active";
  const saved = await db.transaction(async tx => {
    const [updated] = await tx.update(smartSessions).set({ data, status, revision: session.revision + 1 })
      .where(and(eq(smartSessions.id, session.id), eq(smartSessions.revision, session.revision), eq(smartSessions.status, "active"))).returning();
    if (!updated) throw new SmartConflict("The session changed in another tab. Reload to resume your saved progress.");
    if (review && !review.followUp) await recordReview(tx, data.sources.find(s => s.key === review.sourceKey)!, review, session.id);
    return updated;
  });
  return saved;
}

async function start(restart = false): Promise<SmartView> {
  const [active] = await db.select().from(smartSessions).where(eq(smartSessions.status, "active")).limit(1);
  if (active && !restart) return smartView(active);
  await ensureSeeded();
  const sources = await smartCandidates();
  const previous = await db.select().from(smartSessions).orderBy(desc(smartSessions.createdAt)).limit(5);
  const history = previous.flatMap(s => s.data.queue.flatMap(q => q.exercise && !q.exercise.fallback ? [{ prompt: q.exercise.prompt, target: q.exercise.target }] : [])).slice(0, 60);
  const data: SmartData = { version: 1, sources, queue: sources.map(source => ({ id: randomUUID(), sourceKey: source.key, followUp: false })), index: 0, history };
  const session = await db.transaction(async tx => {
    if (restart && active) await tx.update(smartSessions).set({ status: "abandoned" }).where(and(eq(smartSessions.id, active.id), eq(smartSessions.revision, active.revision), eq(smartSessions.status, "active")));
    const [created] = await tx.insert(smartSessions).values({ id: randomUUID(), status: sources.length ? "active" : "completed", data })
      .onConflictDoNothing().returning();
    if (created) return created;
    const [existing] = await tx.select().from(smartSessions).where(eq(smartSessions.status, "active"));
    if (!existing) throw new SmartConflict("The session changed. Reload to continue.");
    return existing;
  });
  return smartView(session);
}

export async function smartAction(action: SmartAction, ai: SmartAI = smartAI): Promise<SmartView> {
  return locked(async () => {
    if (action.action === "start") return start(action.restart);
    const [session] = await db.select().from(smartSessions).where(eq(smartSessions.id, action.sessionId)).limit(1);
    if (!session) throw new SmartConflict("Session not found. Reload to start a new one.");
    const data = structuredClone(session.data);
    const index = data.queue.findIndex(q => q.id === action.questionId);
    if (index < 0 || index > data.index) throw new SmartConflict("This question is no longer current. Reload to resume.");
    // Retries of an already completed step are no-ops, including from a second tab.
    if (index < data.index || session.status !== "active") return smartView(session);
    const question = data.queue[index];
    const source = data.sources.find(s => s.key === question.sourceKey)!;
    if (action.action === "prepare") {
      if (question.exercise) return smartView(session);
      if (!await available(source)) {
        question.skipped = true; data.index++;
        return smartView(await persist(session, data));
      }
      const history = data.history.concat(data.queue.flatMap(q => q.exercise ? [{ prompt: q.exercise.prompt, target: q.exercise.target }] : []));
      const mistakes = source.evidence.concat(data.queue.flatMap(q => q.attempt?.rating != null && q.attempt.rating < 2 ? [`${q.attempt.answer} → ${q.attempt.grade.corrected}. ${q.attempt.grade.explanation}`] : []));
      try {
        const exercise = await ai.generate(source, history, mistakes);
        // Validate even injected providers and never replace an already persisted question.
        smartExerciseSchema(source, history).parse({ ...exercise, sourceKey: source.key });
        question.exercise = exercise;
      } catch {
        question.exercise = { prompt: source.prompt, target: source.target, rubric: source.topic, provider: "original", fallback: true };
      }
      return smartView(await persist(session, data));
    }
    if (action.action === "skip" || action.action === "next") {
      if (action.action === "next" && question.attempt?.rating == null) throw new SmartConflict("Check or rate this answer before continuing, or skip it.");
      if (action.action === "skip" && question.attempt?.rating == null) question.skipped = true;
      data.index++;
      return smartView(await persist(session, data));
    }
    if (!question.exercise) throw new SmartConflict("Wait for the exercise to load before answering.");
    if (action.action === "answer") {
      if (question.attempt) return smartView(session);
      try {
        const grade = await ai.grade(source, question.exercise, action.answer);
        question.attempt = { answer: action.answer, grade, rating: grade.verdict === "UNGRADED" ? null : grade.verdict === "WRONG" ? 0 : 2, elapsedMs: action.elapsedMs, scheduled: grade.verdict !== "UNGRADED" && !question.followUp };
      } catch {
        question.attempt = { answer: action.answer, grade: { verdict: "UNGRADED", corrected: question.exercise.target, explanation: "AI couldn't check this answer. Compare it with the model answer, then rate your recall or skip without changing your review schedule.", errorType: "none", provider: "unavailable" }, rating: null, elapsedMs: action.elapsedMs, scheduled: false };
      }
    } else {
      if (!question.attempt) throw new SmartConflict("Submit an answer before rating it.");
      if (question.attempt.rating != null) return smartView(session);
      question.attempt.rating = action.rating;
      question.attempt.scheduled = !question.followUp;
    }
    addSmartFollowUp(data, question.id, randomUUID());
    return smartView(await persist(session, data, question.attempt.rating === null ? undefined : question));
  });
}
