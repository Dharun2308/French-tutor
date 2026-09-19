import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { learningItems, phrases, settings } from "@/lib/db/schema";
import { recordItemReview, type ReviewTransaction } from "@/lib/items/review";
import { ensureSeeded } from "@/lib/seed/ensure-seeded";
import { foundationsAI, type FoundationsAI } from "./ai";
import { foundationsCandidates } from "./candidates";
import { foundationsExerciseSchema, foundationsRecall } from "./exercise";
import { FOUNDATIONS_VERSION, foundationsCard, isFoundationsLevel, isFoundationsSource } from "./level";
import { foundationsSchedule, reinforce } from "./plan";
import { foundationsReviews, foundationsSessions } from "./schema";
import type { FoundationsData, FoundationsQuestion, FoundationsSource, FoundationsView } from "./types";

const identity = { sessionId: z.string().uuid(), questionId: z.string().uuid() };
export const FoundationsActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), restart: z.boolean().optional(), mix: z.enum(["blend", "notes", "everyday"]).default("blend") }),
  z.object({ action: z.literal("prepare"), ...identity }),
  z.object({ action: z.literal("answer"), ...identity, answer: z.string().trim().min(1).max(500), elapsedMs: z.number().int().min(0).max(3_600_000).default(0) }),
  z.object({ action: z.literal("reveal"), ...identity }),
  z.object({ action: z.literal("rate"), ...identity, rating: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]) }),
  z.object({ action: z.literal("skip"), ...identity }),
]);
export type FoundationsAction = z.infer<typeof FoundationsActionSchema>;
type Session = typeof foundationsSessions.$inferSelect;
export class FoundationsConflict extends Error {}

declare global { var __foundationsLock: Promise<void> | undefined; }
async function locked<T>(work: () => Promise<T>): Promise<T> {
  const previous = globalThis.__foundationsLock ?? Promise.resolve();
  let release!: () => void;
  globalThis.__foundationsLock = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try { return await work(); } finally { release(); }
}

export function foundationsView(session: Session): FoundationsView {
  const { data } = session;
  const question = data.queue[data.index];
  const source = question && data.sources.find(s => s.key === question.sourceKey);
  const rated = data.queue.filter(q => !q.followUp && q.feedback?.rating != null);
  return {
    id: session.id, status: session.status, mix: data.mix, completed: data.index, total: data.queue.length,
    ratings: { 0: rated.filter(q => q.feedback!.rating === 0).length, 1: rated.filter(q => q.feedback!.rating === 1).length, 2: rated.filter(q => q.feedback!.rating === 2).length, 3: rated.filter(q => q.feedback!.rating === 3).length },
    followUps: data.queue.filter(q => q.followUp && q.feedback?.rating != null).length,
    skipped: data.queue.filter(q => q.skipped).length,
    notesAvailable: data.sources.filter(s => s.kind === "personal").length,
    question: question && source ? {
      id: question.id, label: source.label, reason: question.followUp ? "Recall the sentence again after a short gap" : source.retryExercise ? "Revisit the sentence you rated Again or Hard" : source.reason,
      origin: source.kind === "personal" ? "Lesson notes" : "Everyday French",
      challenge: source.challenge, memory: source.memory, followUp: question.followUp, retry: !!source.retryExercise,
      prompt: question.exercise?.prompt ?? null, provider: question.exercise?.provider ?? null,
      fallback: question.exercise?.fallback ?? false,
      feedback: question.feedback ? { ...question.feedback, modelAnswer: question.exercise!.target } : null,
    } : null,
    recap: rated.filter(q => q.feedback!.rating! < 2).map(q => ({ french: q.exercise!.target, english: q.exercise!.prompt, rating: q.feedback!.rating!, explanation: q.feedback!.grade.explanation })),
  };
}

export async function getFoundationsSession(): Promise<FoundationsView | null> {
  const [active] = await db.select().from(foundationsSessions).where(eq(foundationsSessions.status, "active")).limit(1);
  // The normal client start request replaces an obsolete round without discarding its reviews.
  if (active && active.data.version !== FOUNDATIONS_VERSION) return null;
  const [completed] = active ? [] : await db.select().from(foundationsSessions).where(eq(foundationsSessions.status, "completed")).orderBy(desc(foundationsSessions.createdAt)).limit(1);
  return active || completed ? foundationsView(active ?? completed) : null;
}

async function available(source: FoundationsSource, tx: ReviewTransaction | typeof db = db): Promise<boolean> {
  if (!isFoundationsSource(source)) return false;
  if (source.kind === "personal") {
    const [item] = await tx.select().from(learningItems).where(eq(learningItems.id, source.id));
    return !!item && !item.suspended && isFoundationsLevel(item.cefrLevel) && foundationsCard(item).targetFr === source.target && foundationsCard(item).promptEn === source.prompt;
  }
  const [phrase] = await tx.select().from(phrases).where(eq(phrases.id, source.id));
  const [config] = await tx.select().from(settings).where(eq(settings.id, 1));
  const prompt = phrase?.category.startsWith("fill_") ? `Fill the blank: ${phrase.english}` : `Write in French: ${phrase?.english}`;
  return !!phrase && !phrase.suspended && isFoundationsLevel(phrase.level) && phrase.french === source.target && prompt === source.prompt && !!config?.activePhraseCategories.includes(phrase.category);
}

async function saveRating(tx: ReviewTransaction, source: FoundationsSource, question: FoundationsQuestion, sessionId: string) {
  if (!await available(source, tx)) throw new FoundationsConflict("This source was edited, suspended or removed from practice. Skip it to continue.");
  const feedback = question.feedback!, rating = feedback.rating!, now = new Date();
  const [inserted] = await tx.insert(foundationsReviews).values({
    sessionId, questionId: question.id, sourceKey: source.key, rating, independent: !question.followUp,
    exercise: question.exercise!, answer: feedback.answer, grade: feedback.grade, revealed: feedback.revealed, ratedAt: now,
  }).onConflictDoNothing({ target: [foundationsReviews.sessionId, foundationsReviews.questionId] }).returning();
  if (!inserted) throw new FoundationsConflict("This rating is already saved. Reload to resume.");
  if (question.followUp) return;
  if (source.kind === "personal") {
    const result = await recordItemReview(tx, {
      requestId: `foundation:${sessionId}:${question.id}`, itemId: source.id, rating, direction: "production",
      verdict: feedback.grade.verdict, errorType: feedback.grade.errorType,
      userAnswer: feedback.answer, correctedAnswer: feedback.grade.corrected,
      gradeReason: feedback.grade.explanation, elapsedMs: feedback.elapsedMs, gradedBy: feedback.revealed ? "self" : feedback.grade.provider,
    }, now);
    if (!result) throw new FoundationsConflict("The lesson phrase is no longer available.");
    feedback.dueAt = result.dueAt;
    return;
  }
  const [phrase] = await tx.select().from(phrases).where(eq(phrases.id, source.id));
  const next = foundationsSchedule({ easeX100: phrase.easeFactor, intervalDays: phrase.intervalDays, repetitions: phrase.repetitions, nextReviewAt: phrase.nextReviewAt, lastReviewedAt: phrase.lastReviewedAt }, rating, source.memory.recentStruggles, now);
  await tx.update(phrases).set({
    easeFactor: next.easeX100, intervalDays: next.intervalDays, repetitions: next.repetitions,
    nextReviewAt: next.nextReviewAt, lastReviewedAt: now,
    correctCount: phrase.correctCount + (rating >= 2 ? 1 : 0), wrongCount: phrase.wrongCount + (rating < 2 ? 1 : 0),
  }).where(eq(phrases.id, source.id));
  feedback.dueAt = next.nextReviewAt.toISOString();
}

async function persist(session: Session, data: FoundationsData, review?: FoundationsQuestion): Promise<Session> {
  return db.transaction(async tx => {
    // Reserve the revision first; any review/availability failure rolls it back too.
    const [reserved] = await tx.update(foundationsSessions).set({ revision: session.revision + 1 })
      .where(and(eq(foundationsSessions.id, session.id), eq(foundationsSessions.revision, session.revision), eq(foundationsSessions.status, "active"))).returning();
    if (!reserved) throw new FoundationsConflict("This round changed in another tab. Reload to resume saved progress.");
    if (review) await saveRating(tx, data.sources.find(s => s.key === review.sourceKey)!, review, session.id);
    const [updated] = await tx.update(foundationsSessions).set({ data, status: data.index >= data.queue.length ? "completed" : "active" }).where(eq(foundationsSessions.id, session.id)).returning();
    return updated;
  });
}

async function start(action: Extract<FoundationsAction, { action: "start" }>): Promise<FoundationsView> {
  const [active] = await db.select().from(foundationsSessions).where(eq(foundationsSessions.status, "active")).limit(1);
  if (active && active.data.version === FOUNDATIONS_VERSION && !action.restart) return foundationsView(active);
  await ensureSeeded();
  const plan = await foundationsCandidates(action.mix);
  const data: FoundationsData = { version: FOUNDATIONS_VERSION, mix: action.mix, ...plan, index: 0, queue: plan.sources.map(source => ({ id: randomUUID(), sourceKey: source.key, followUp: false, exercise: source.retryExercise })) };
  const session = await db.transaction(async tx => {
    if (active) await tx.update(foundationsSessions).set({ status: "abandoned" }).where(and(eq(foundationsSessions.id, active.id), eq(foundationsSessions.revision, active.revision)));
    const [created] = await tx.insert(foundationsSessions).values({ id: randomUUID(), status: data.queue.length ? "active" : "completed", data }).onConflictDoNothing().returning();
    if (created) return created;
    const [existing] = await tx.select().from(foundationsSessions).where(eq(foundationsSessions.status, "active"));
    if (!existing) throw new FoundationsConflict("This round changed. Reload to continue.");
    return existing;
  });
  return foundationsView(session);
}

export async function foundationsAction(action: FoundationsAction, ai: FoundationsAI = foundationsAI): Promise<FoundationsView> {
  return locked(async () => {
    if (action.action === "start") return start(action);
    const [session] = await db.select().from(foundationsSessions).where(eq(foundationsSessions.id, action.sessionId));
    if (!session) throw new FoundationsConflict("Round not found. Reload to start a new one.");
    if (session.data.version !== FOUNDATIONS_VERSION) throw new FoundationsConflict("Foundations now uses easier phrases. Reload to start an easier round; your saved ratings are kept.");
    const data = structuredClone(session.data);
    const index = data.queue.findIndex(q => q.id === action.questionId);
    if (index < 0 || index > data.index) throw new FoundationsConflict("This question is no longer current. Reload to resume.");
    if (index < data.index || session.status !== "active") return foundationsView(session);
    const question = data.queue[index], source = data.sources.find(s => s.key === question.sourceKey)!;
    if (action.action === "prepare") {
      if (question.exercise) return foundationsView(session);
      if (!await available(source)) { question.skipped = true; data.index++; return foundationsView(await persist(session, data)); }
      const history = data.history.concat(data.queue.flatMap(q => q.exercise ? [q.exercise] : []));
      const mistakes = source.evidence.concat(data.queue.flatMap(q => q.feedback?.rating != null && q.feedback.rating < 2 ? [`${q.feedback.answer} → ${q.feedback.grade.corrected}: ${q.feedback.grade.explanation}`] : []));
      try {
        const exercise = await ai.generate(source, history, data.activeTenses, mistakes);
        foundationsExerciseSchema(source).parse({ ...exercise, sourceKey: source.key });
        question.exercise = exercise;
      } catch {
        question.exercise = { ...foundationsRecall(source), rubric: source.topic, provider: "original", fallback: true };
      }
      return foundationsView(await persist(session, data));
    }
    if (action.action === "skip") { question.skipped = true; data.index++; return foundationsView(await persist(session, data)); }
    if (!question.exercise) throw new FoundationsConflict("Wait for the exercise to load before answering.");
    if (action.action === "rate") {
      if (!question.feedback) throw new FoundationsConflict("Check or reveal the answer before rating your recall.");
      question.feedback.rating = action.rating;
      reinforce(data, question.id, randomUUID());
      data.index++;
      return foundationsView(await persist(session, data, question));
    }
    if (question.feedback) return foundationsView(session);
    if (!await available(source)) throw new FoundationsConflict("This source was edited or suspended. Skip it to continue.");
    if (action.action === "reveal") {
      question.feedback = { answer: "", grade: { verdict: "UNGRADED", corrected: question.exercise.target, explanation: "Compare with the model sentence, then rate how well you recalled it before revealing.", errorType: "none", provider: "self" }, revealed: true, elapsedMs: 0, rating: null, dueAt: null };
    } else {
      let grade;
      try { grade = await ai.grade(source, question.exercise, action.answer); }
      catch { grade = { verdict: "UNGRADED" as const, corrected: question.exercise.target, explanation: "AI couldn't check this answer. Compare with the model sentence and rate your own recall.", errorType: "none" as const, provider: "unavailable" }; }
      question.feedback = { answer: action.answer, grade, revealed: false, elapsedMs: action.elapsedMs, rating: null, dueAt: null };
    }
    // Feedback is durable now; only the explicit rating changes the learning schedule.
    return foundationsView(await persist(session, data));
  });
}
