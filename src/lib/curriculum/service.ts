import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { TOPICS, TOPIC_BY_ID } from "./catalog";
import { topicAttempts, topicErrors, topicProgress, topicSessions } from "./schema";
import { assessment, dailyPlan, earliestReview, errorWeight, initialStage, initialState, prerequisiteReady, reviewDate, stageTarget, successfulErrorReview } from "./progression";
import { AllProvidersFailed } from "@/lib/ai/providers";
import { curriculumAI, type CurriculumAI } from "./ai";
import type { ErrorTag, Question, SessionData, Stage, TopicGrade, TopicState } from "./types";

type SessionRow = typeof topicSessions.$inferSelect;
export class TopicNotFound extends Error {}
export class TopicConflict extends Error {}

async function ensureProgress() {
  await db.insert(topicProgress).values(TOPICS.map((topic) => ({ topicId: topic.id, state: initialState(topic) }))).onConflictDoNothing();
}

export async function curriculumOverview() {
  await ensureProgress();
  const [progress, attempts, errors, sessions] = await Promise.all([
    db.select().from(topicProgress), db.select().from(topicAttempts).orderBy(desc(topicAttempts.at), desc(topicAttempts.id)),
    db.select().from(topicErrors), db.select().from(topicSessions).where(eq(topicSessions.active, true)).orderBy(desc(topicSessions.createdAt)),
  ]);
  const states = new Map(progress.map((p) => [p.topicId, p.state]));
  const topics = TOPICS.map((topic) => {
    const p = progress.find((row) => row.topicId === topic.id)!;
    const rows = attempts.filter((a) => a.topicId === topic.id);
    const metric = (stage: string) => {
      const subset = rows.filter((a) => a.stage === stage && !a.remediation && !a.grade.ungraded).slice(0, 20);
      const correct = subset.filter((a) => a.grade.conceptCorrect && a.independent).length;
      return { total: subset.length, correct, percent: subset.length ? Math.round(correct / subset.length * 100) : null };
    };
    const topicErrorRows = errors.filter((e) => e.topicId === topic.id && (e.weight > 0 || e.reviewAt)).sort((a, b) => b.weight - a.weight);
    return { ...topic, ...p, controlled: metric("controlled"), production: metric("production"), mixed: metric("mixed"),
      oral: rows.filter((a) => a.stage === "oral" && a.spoken).length,
      errors: topicErrorRows,
      due: Boolean((p.dueAt && p.dueAt <= new Date()) || topicErrorRows.some((e) => e.reviewAt && e.reviewAt <= new Date())),
      ready: p.state !== "NOT_STARTED" || topic.prerequisites.every((id) => prerequisiteReady(states.get(id) ?? "NOT_STARTED")),
      sessionId: sessions.find((s) => s.topicId === topic.id)?.id ?? null,
    };
  });
  const review = topics.filter((t) => t.due || t.state === "REVISIT_REQUIRED").sort((a, b) => b.priority - a.priority)[0];
  const next = topics.filter((t) => t.kind === "grammar" && t.coverage === "new" && !prerequisiteReady(t.state) && t.ready)
    .sort((a, b) => Number(b.state !== "NOT_STARTED") - Number(a.state !== "NOT_STARTED") || b.priority - a.priority)[0];
  return { topics, recommendedReview: review?.id ?? "article-negation", recommendedNew: next?.id ?? null,
    mixedSessionId: sessions.find((s) => s.topicId === "mixed")?.id ?? null };
}

function publicSession(row: SessionRow) {
  const data = row.data;
  const question = data.questions[data.current];
  // Answer keys, private grading rubrics and future questions never leave the server.
  const visible = question ? { id: question.id, stage: question.stage, prompt: question.prompt,
    audio: question.audio, hint: question.hinted ? question.hint : null,
    topicTitle: data.mode === "mixed" && !data.feedback ? null : TOPIC_BY_ID.get(question.topicId)?.title,
    remediation: question.remediation } : null;
  return { id: row.id, topicId: row.topicId, title: row.topicId === "mixed" ? "Daily mix" : TOPIC_BY_ID.get(row.topicId)?.title,
    mode: data.mode, stage: data.stage, theory: data.theory, question: visible,
    answered: data.questions.slice(0, data.current + (data.feedback ? 1 : 0)).filter((q) => !q.remediation && !q.ungraded).length,
    target: data.target, feedback: data.feedback, provider: data.provider, result: data.result, completed: data.completed };
}

export async function readTopicSession(id: string) {
  const [row] = await db.select().from(topicSessions).where(eq(topicSessions.id, id));
  if (!row) throw new TopicNotFound("Session not found.");
  return publicSession(row);
}

/** Serialize mutations per session in the single app process; database revision is the final guard. */
const inFlight = new Set<string>();
async function exclusively<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (inFlight.has(key)) throw new TopicConflict("This session is already updating. Try again in a moment.");
  inFlight.add(key);
  try { return await fn(); } finally { inFlight.delete(key); }
}

async function saveData(row: SessionRow, data: SessionData) {
  const updated = await db.update(topicSessions).set({ data, revision: row.revision + 1, active: !data.completed })
    .where(and(eq(topicSessions.id, row.id), eq(topicSessions.revision, row.revision))).returning();
  if (!updated.length) throw new TopicConflict("Session changed in another tab. Reload to continue.");
  return updated[0];
}

async function questionsFor(ai: CurriculumAI, plan: Parameters<CurriculumAI["questions"]>[0], previous: Question[], focusTags: ErrorTag[] = [], remediation = false) {
  const errors = await db.select().from(topicErrors);
  const offsets = new Map<string, number>();
  const targetedPlan = plan.map((entry) => {
    const pending = errors.filter((e) => e.topicId === entry.topicId && (e.weight > 0 || e.reviewAt))
      .sort((a, b) => (a.reviewAt?.getTime() ?? Infinity) - (b.reviewAt?.getTime() ?? Infinity) || b.weight - a.weight);
    const topicTags = TOPIC_BY_ID.get(entry.topicId)?.tags ?? [];
    const tags = (remediation ? focusTags : pending.map((e) => e.tag)).filter((tag) => topicTags.includes(tag));
    const offset = offsets.get(entry.topicId) ?? 0;
    offsets.set(entry.topicId, offset + 1);
    return { ...entry, ...(offset < tags.length ? { tag: tags[offset] } : {}) };
  });
  const history = await db.select().from(topicSessions).orderBy(desc(topicSessions.createdAt)).limit(20);
  const relevant = history.filter((s) => plan.some((p) => s.topicId === p.topicId) || s.topicId === "mixed");
  const earlier = relevant.flatMap((s) => s.data.questions).filter((q) => !previous.some((p) => p.id === q.id)).slice(-60);
  const contextualTags = [...new Set([...focusTags, ...errors.filter((e) => plan.some((p) => p.topicId === e.topicId) && (e.weight > 0 || e.reviewAt)).map((e) => e.tag)])];
  return ai.questions(targetedPlan, [...earlier, ...previous], contextualTags, remediation);
}

export async function startTopicSession(topicId: string, mode: SessionData["mode"] = "learn", ai = curriculumAI) {
  return exclusively(`start:${topicId}`, async () => {
    if ((topicId === "mixed") !== (mode === "mixed")) throw new Error("Daily mix requires the mixed topic and mixed mode together.");
    await ensureProgress();
    const topic = TOPIC_BY_ID.get(topicId);
    if (!topic && topicId !== "mixed") throw new Error("Unknown topic.");
    const [existing] = await db.select().from(topicSessions).where(and(eq(topicSessions.topicId, topicId), eq(topicSessions.active, true))).orderBy(desc(topicSessions.createdAt)).limit(1);
    if (existing) {
      if (topic) await db.update(topicProgress).set({ lastStudiedAt: new Date() }).where(eq(topicProgress.topicId, topicId));
      return publicSession(existing);
    }
    const [progress] = await db.select().from(topicProgress).where(eq(topicProgress.topicId, topicId));
    if (topic?.prerequisites.length && progress?.state === "NOT_STARTED") {
      const all = await db.select().from(topicProgress);
      const missing = topic.prerequisites.filter((id) => !prerequisiteReady(all.find((p) => p.topicId === id)?.state ?? "NOT_STARTED"));
      if (missing.length) throw new Error(`First build accuracy in: ${missing.map((id) => TOPIC_BY_ID.get(id)?.title).join(", ")}.`);
    }
    const history = await db.select().from(topicSessions).where(eq(topicSessions.topicId, topicId)).orderBy(desc(topicSessions.createdAt)).limit(3);
    const previousQuestions = history.flatMap((s) => s.data.questions).slice(-60);
    let stage: Stage = topicId === "mixed" ? "mixed" : mode === "theory" ? "theory" : mode === "oral" ? "oral" : initialStage(topic!, progress.state, mode === "revisit");
    if (mode === "learn" && progress?.state === "REVISIT_REQUIRED") stage = "targeted";
    if (mode === "learn" && progress?.state === "CONTROLLED_PRACTICE" && progress.needsTheory) stage = "theory";
    if (stage === "oral" && !prerequisiteReady(progress.state)) throw new Error("Reach 85% independent production before starting this topic’s speaking prompts.");
    const errors = await db.select().from(topicErrors).where(eq(topicErrors.topicId, topicId)).orderBy(desc(topicErrors.weight));
    const data: SessionData = { mode: topicId === "mixed" ? "mixed" : mode, stage, theory: null, questions: [], current: 0, target: stageTarget(stage), focusTags: errors.filter((e) => e.weight > 0 || e.reviewAt).map((e) => e.tag), feedback: null, provider: null, result: null, completed: false };
    if (stage === "theory") {
      const result = await ai.theory(topic!, data.focusTags);
      data.theory = result.theory; data.provider = result.provider;
    } else if (topicId === "mixed") {
      const all = await db.select().from(topicProgress);
      const errorRows = await db.select().from(topicErrors);
      const plan = dailyPlan(all.map((p) => ({ id: p.topicId, state: p.state, dueAt: p.dueAt, maintenanceDueAt: p.maintenanceDueAt, lastStudiedAt: p.lastStudiedAt,
        priority: TOPIC_BY_ID.get(p.topicId)?.priority ?? 0, errorWeight: errorRows.filter((e) => e.topicId === p.topicId).reduce((sum, e) => sum + e.weight, 0) })));
      if (!plan.length) throw new Error("Practice a topic first to build your daily mix.");
      const result = await questionsFor(ai, plan, previousQuestions, []);
      data.questions = result.questions; data.provider = result.provider; data.target = plan.length;
    } else {
      const [refresh, result] = await Promise.all([
        stage === "targeted" ? ai.theory(topic!, data.focusTags) : Promise.resolve(null),
        questionsFor(ai, Array.from({ length: 5 }, () => ({ topicId, stage: stage as Exclude<Stage, "theory"> })), previousQuestions, data.focusTags),
      ]);
      if (refresh) data.theory = refresh.theory;
      data.questions = result.questions; data.provider = result.provider;
    }
    const [row] = await db.insert(topicSessions).values({ id: randomUUID(), topicId, data, createdAt: new Date() }).returning();
    if (topic && mode !== "theory") await db.update(topicProgress).set({ updatedAt: new Date(), lastStudiedAt: new Date(),
      ...(stage === "theory" && progress.state === "NOT_STARTED" ? { state: "LEARNING_THEORY" as const } : {}) }).where(eq(topicProgress.topicId, topicId));
    return publicSession(row);
  });
}

async function recordAnswer(row: SessionRow, question: Question, answer: string, grade: TopicGrade, provider: string, revealed: boolean, spoken: boolean, elapsedMs: number) {
  const feedback = { ...grade, submitted: answer, questionId: question.id, provider, revealed };
  const data = structuredClone({ ...row.data, feedback });
  data.questions[data.current].ungraded = grade.ungraded ?? false;
  return db.transaction(async (tx) => {
    const changed = await tx.update(topicSessions).set({ data, revision: row.revision + 1 }).where(and(eq(topicSessions.id, row.id), eq(topicSessions.revision, row.revision))).returning();
    if (!changed.length) throw new TopicConflict("Session changed. Reload to continue.");
    const inserted = await tx.insert(topicAttempts).values({ sessionId: row.id, questionId: question.id, topicId: question.topicId,
      stage: question.stage, answer, grade, at: new Date(), independent: !grade.ungraded && !question.hinted && !revealed && !question.remediation,
      remediation: question.remediation, spoken, elapsedMs }).onConflictDoNothing().returning();
    if (!inserted.length) throw new TopicConflict("This answer was already saved. Reload to continue.");
    if (grade.ungraded) return changed[0];
    const [progress] = await tx.select().from(topicProgress).where(eq(topicProgress.topicId, question.topicId));
    let needsRevisit = false;
    const testedTags = new Set<ErrorTag>([question.tag, ...grade.errorTags]);
    for (const tag of testedTags) {
      const [existing] = await tx.select().from(topicErrors).where(and(eq(topicErrors.topicId, question.topicId), eq(topicErrors.tag, tag)));
      const failed = !grade.conceptCorrect && grade.errorTags.includes(tag);
      // Do not erase evidence for a rule the answer did not successfully demonstrate.
      if (!failed && (!grade.conceptCorrect || question.hinted || revealed)) continue;
      let misses = (existing && (existing.weight > 0 || existing.reviewAt) ? existing.misses : 0) + (failed ? 1 : 0);
      const streak = failed ? 0 : (existing?.streak ?? 0) + 1;
      const weight = errorWeight(existing?.weight ?? 0, !failed);
      const reviewAt = failed ? new Date(Date.now() + (misses >= 3 ? 15 * 60_000 : 86_400_000))
        : successfulErrorReview(existing?.reviewAt ?? null, existing?.lastMissAt ?? null, misses, weight);
      if (!weight && !reviewAt) misses = 0;
      await tx.insert(topicErrors).values({ topicId: question.topicId, tag, misses, streak, weight, reviewAt, lastMissAt: failed ? new Date() : existing?.lastMissAt })
        .onConflictDoUpdate({ target: [topicErrors.topicId, topicErrors.tag], set: { misses, streak, weight, reviewAt, lastMissAt: failed ? new Date() : existing?.lastMissAt } });
      if (failed && prerequisiteReady(progress.state) && misses >= 3) needsRevisit = true;
    }
    const pending = await tx.select().from(topicErrors).where(eq(topicErrors.topicId, question.topicId));
    await tx.update(topicProgress).set({ dueAt: earliestReview(needsRevisit ? null : progress.maintenanceDueAt, pending), updatedAt: new Date(),
      ...(row.data.mode !== "mixed" ? { lastStudiedAt: new Date() } : {}),
      ...(needsRevisit ? { state: "REVISIT_REQUIRED" as const, maintenanceStep: 0, maintenanceDueAt: null } : {}) }).where(eq(topicProgress.topicId, question.topicId));
    return changed[0];
  });
}

async function completeStage(row: SessionRow) {
  const data: SessionData = { ...row.data, completed: true };
  const attempts = await db.select().from(topicAttempts).where(eq(topicAttempts.sessionId, row.id));
  const primary = attempts.filter((a) => !a.remediation && a.stage !== "oral" && !a.grade.ungraded);
  const correct = primary.filter((a) => a.grade.conceptCorrect && a.independent).length;
  const percent = primary.length ? Math.round(correct / primary.length * 100) : null;
  const saved = await db.transaction(async (tx) => {
    const [progress] = await tx.select().from(topicProgress).where(eq(topicProgress.topicId, row.topicId));
    let state: TopicState | undefined;
    let maintenanceDueAt = progress?.maintenanceDueAt ?? null;
    let step = progress?.maintenanceStep ?? 0;
    if (data.mode === "mixed") {
      data.result = `${correct}/${primary.length} independent written answers correct${percent === null ? "" : ` (${percent}%)`}. Speaking and ungraded answers are separate. Your recurring errors will guide the next mix.`;
      // Short due retrieval can maintain established knowledge, never establish new mastery.
      for (const topicId of new Set(primary.map((a) => a.topicId))) {
        const written = attempts.filter((a) => a.topicId === topicId && !a.remediation && a.stage !== "oral");
        const [p] = await tx.select().from(topicProgress).where(eq(topicProgress.topicId, topicId));
        if (!p || !prerequisiteReady(p.state) || !p.maintenanceDueAt || p.maintenanceDueAt > new Date() || written.length < 2 ||
          !written.every((a) => !a.grade.ungraded && a.independent && a.grade.conceptCorrect)) continue;
        const maintenanceStep = Math.min(p.maintenanceStep + 1, 4);
        const maintenanceDueAt = reviewDate(maintenanceStep);
        const errors = await tx.select().from(topicErrors).where(eq(topicErrors.topicId, topicId));
        await tx.update(topicProgress).set({ state: "MAINTENANCE", maintenanceStep, maintenanceDueAt,
          dueAt: earliestReview(maintenanceDueAt, errors), updatedAt: new Date() }).where(eq(topicProgress.topicId, topicId));
      }
    } else if (data.stage === "oral") {
      data.result = "Speaking practice saved. Typed responses and self-reported speaking are practice evidence; pronunciation and conversational automaticity have not been assessed.";
    } else if (primary.length < data.target) {
      data.outcome = "insufficient";
      data.result = `${primary.length}/${data.target} questions graded. Some answers could not be checked. Your level and maintenance schedule are unchanged; try another round when checking is available.`;
    } else if (data.stage === "controlled" || data.stage === "targeted") {
      const pass = correct / primary.length >= .8;
      state = pass ? "PRODUCTION_PRACTICE" : "CONTROLLED_PRACTICE";
      data.outcome = pass ? "pass" : "reteach";
      data.result = `${correct}/${primary.length} correct. ${pass ? "Ready for full-sentence production. Your next round checks independent accuracy." : "This rule needs another short explanation and guided practice."}`;
    } else {
      const outcome = assessment(correct, primary.length);
      data.outcome = outcome;
      if (outcome === "pass") {
        const maintained = Boolean(maintenanceDueAt) || prerequisiteReady(progress.state);
        state = maintained ? "MAINTENANCE" : "85_PERCENT_REACHED";
        if (!maintained) { step = 0; maintenanceDueAt = reviewDate(step); }
        else if (!maintenanceDueAt || maintenanceDueAt <= new Date()) {
          step = Math.min(step + 1, 4); maintenanceDueAt = reviewDate(step);
        }
        data.result = `${correct}/${primary.length} correct (${percent}%). Ready for spaced maintenance and speaking practice. Your maintenance schedule is saved. This is a learning threshold, not automatic mastery.`;
      } else if (outcome === "targeted") {
        state = "REVISIT_REQUIRED";
        data.result = `${correct}/${primary.length} correct (${percent}%). Keep the rules you know; the next round targets the subrules you missed.`;
      } else {
        state = "CONTROLLED_PRACTICE";
        data.result = `${correct}/${primary.length} correct (${percent}%). Briefly review the rule, then rebuild it with guided questions.`;
      }
    }
    if (data.outcome === "targeted" || data.outcome === "reteach") { step = 0; maintenanceDueAt = null; }
    const changed = await tx.update(topicSessions).set({ data, active: false, revision: row.revision + 1 })
      .where(and(eq(topicSessions.id, row.id), eq(topicSessions.revision, row.revision))).returning();
    if (!changed.length) throw new TopicConflict("Session changed. Reload to continue.");
    if (state) {
      const errors = await tx.select().from(topicErrors).where(eq(topicErrors.topicId, row.topicId));
      const dueAt = earliestReview(maintenanceDueAt, [
        ...errors,
        ...(data.outcome === "reteach" || data.outcome === "targeted" ? [{ reviewAt: new Date() }] : []),
      ]);
      await tx.update(topicProgress).set({ state, dueAt, maintenanceDueAt, maintenanceStep: step,
        ...(data.outcome === "reteach" ? { needsTheory: true } : data.outcome === "pass" ? { needsTheory: false } : {}), updatedAt: new Date() })
        .where(eq(topicProgress.topicId, row.topicId));
    }
    return changed[0];
  });
  return publicSession(saved);
}

export interface TopicAction {
  action: "confirm" | "answer" | "reveal" | "hint" | "next" | "leave";
  sessionId: string; questionId?: string; answer?: string; spoken?: boolean; elapsedMs?: number; teachBack?: string;
}

export async function actOnTopicSession(body: TopicAction, ai: CurriculumAI = curriculumAI) {
  return exclusively(body.sessionId, async () => {
    const [row] = await db.select().from(topicSessions).where(eq(topicSessions.id, body.sessionId));
    if (!row) throw new TopicNotFound("Session not found.");
    const data = structuredClone(row.data);
    if (data.completed) return publicSession(row);
    if (body.action === "leave") {
      data.completed = true; data.outcome = "left"; data.result = "Session ended. Saved answers remain in your topic history.";
      return publicSession(await saveData(row, data));
    }
    if (body.action === "confirm") {
      if (data.stage !== "theory") return publicSession(row);
      const [progress] = await db.select().from(topicProgress).where(eq(topicProgress.topicId, row.topicId));
      const nextStage = data.mode === "theory" ? initialStage(TOPIC_BY_ID.get(row.topicId)!, progress.state, false) : "controlled";
      const stage = nextStage === "theory" ? "controlled" : nextStage;
      const result = await questionsFor(ai, Array.from({ length: 5 }, () => ({ topicId: row.topicId, stage })), data.questions, data.focusTags);
      data.stage = stage; data.target = stageTarget(stage); data.questions = result.questions; data.current = 0; data.provider = result.provider;
      const saved = await db.transaction(async (tx) => {
        const changed = await tx.update(topicSessions).set({ data, revision: row.revision + 1 }).where(and(eq(topicSessions.id, row.id), eq(topicSessions.revision, row.revision))).returning();
        if (!changed.length) throw new TopicConflict("Session changed. Reload to continue.");
        await tx.update(topicProgress).set({ theoryUnderstood: true, needsTheory: false, lastStudiedAt: new Date(), teachBack: body.teachBack ?? null, ...(progress.state === "NOT_STARTED" || progress.state === "LEARNING_THEORY" ? { state: "CONTROLLED_PRACTICE" as const } : {}), updatedAt: new Date() }).where(eq(topicProgress.topicId, row.topicId));
        return changed[0];
      });
      return publicSession(saved);
    }
    const question = data.questions[data.current];
    if (!question || body.questionId !== question.id) {
      // Retried navigation after a successful save returns the current card, never skips another.
      if (body.action === "next") return publicSession(row);
      throw new TopicConflict("This question has changed. Reload to continue.");
    }
    if (body.action === "hint") {
      if (data.feedback) return publicSession(row);
      question.hinted = true;
      return publicSession(await saveData(row, data));
    }
    if (body.action === "answer" || body.action === "reveal") {
      if (data.feedback) return publicSession(row);
      const revealed = body.action === "reveal";
      const answer = body.answer ?? "";
      if (!revealed && !answer.trim()) throw new Error("Enter your answer first.");
      let result;
      try { result = revealed ? { grade: { conceptCorrect: false, corrected: question.answer, explanation: question.rule, minorOnly: false, errorTags: [question.tag] } satisfies TopicGrade, provider: "local" }
        : await ai.grade(question, answer);
      } catch (error) {
        if (!(error instanceof AllProvidersFailed)) throw error;
        result = { provider: "unavailable", grade: { ungraded: true, conceptCorrect: false, minorOnly: false, errorTags: [],
          corrected: question.answer, explanation: "Checking is unavailable. Compare with this possible answer. This attempt is saved without affecting accuracy or error history." } satisfies TopicGrade };
      }
      const saved = await recordAnswer(row, question, answer, result.grade, result.provider, revealed, body.spoken ?? false, body.elapsedMs ?? 0);
      return publicSession(saved);
    }
    if (body.action === "next") {
      if (!data.feedback) throw new Error("Check or reveal your answer first.");
      const attempts = await db.select().from(topicAttempts).where(eq(topicAttempts.sessionId, row.id));
      const primaryCount = attempts.filter((a) => !a.remediation && !a.grade.ungraded).length;
      const askedCount = attempts.filter((a) => !a.remediation).length;
      const finished = primaryCount >= data.target || askedCount >= data.target + 5;
      if (!data.feedback.ungraded && !data.feedback.conceptCorrect && data.questions.filter((q) => q.remediation).length < 15) {
        const errors = await db.select().from(topicErrors).where(eq(topicErrors.topicId, question.topicId));
        const repeated = errors.some((e) => data.feedback!.errorTags.includes(e.tag) && e.misses > 0 && e.misses % 3 === 0);
        const count = repeated ? 3 : 1;
        const result = await questionsFor(ai, Array.from({ length: count }, () => ({ topicId: question.topicId, stage: "targeted" as const })), data.questions, data.feedback.errorTags, true);
        data.questions.splice(data.current + 1, 0, ...result.questions); data.provider = result.provider;
      } else if (finished && !data.questions[data.current + 1]?.remediation) {
        return completeStage(row);
      }
      data.current++;
      data.feedback = null;
      if (!data.questions[data.current]) {
        if (finished) return completeStage(row);
        const count = Math.min(5, data.target - primaryCount, data.target + 5 - askedCount);
        const ungraded = data.questions.filter((q) => q.ungraded && !q.remediation).slice(-count);
        const plan = Array.from({ length: count }, (_, i) => data.mode === "mixed"
          ? { topicId: ungraded[i % ungraded.length].topicId, stage: ungraded[i % ungraded.length].stage }
          : { topicId: row.topicId, stage: data.stage as Exclude<Stage, "theory"> });
        const result = await questionsFor(ai, plan, data.questions, data.focusTags);
        data.questions.push(...result.questions); data.provider = result.provider;
      }
      return publicSession(await saveData(row, data));
    }
    throw new Error("Unknown action.");
  });
}
