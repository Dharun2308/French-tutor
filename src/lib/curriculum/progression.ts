import type { Stage, Topic, TopicState } from "./types";

export function initialState(topic: Topic): TopicState {
  return topic.coverage === "practiced" ? "PRODUCTION_PRACTICE" : topic.coverage === "partial" ? "CONTROLLED_PRACTICE" : "NOT_STARTED";
}
export function initialStage(topic: Topic, state: TopicState, revisit: boolean): Stage {
  if (revisit) return "production";
  if (state === "NOT_STARTED" || state === "LEARNING_THEORY") return "theory";
  if (state === "CONTROLLED_PRACTICE") return "controlled";
  if (state === "REVISIT_REQUIRED") return "targeted";
  if (state === "MAINTENANCE" || state === "85_PERCENT_REACHED" || state === "AUTOMATIC") return "mixed";
  return "production";
}
export function stageTarget(stage: Stage) { return stage === "production" ? 20 : stage === "mixed" ? 10 : 5; }
export function assessment(correct: number, total: number): "pass" | "targeted" | "reteach" | "insufficient" {
  if (total < 10) return "insufficient";
  const accuracy = correct / total;
  return accuracy >= .85 ? "pass" : accuracy >= .7 ? "targeted" : "reteach";
}
export function reviewDate(step: number, now = Date.now()) {
  const days = [1, 3, 7, 14, 30][Math.min(Math.max(0, step), 4)];
  return new Date(now + days * 86_400_000);
}
export function errorWeight(previous: number, correct: boolean) {
  return correct ? Math.max(0, previous - 1) : Math.min(20, previous + 3);
}
/** Immediate remediation must not cancel delayed retrieval of a repeated error. */
export function successfulErrorReview(previousDue: Date | null, lastMiss: Date | null, misses: number, weight: number, now = Date.now()): Date | null {
  if (previousDue && previousDue.getTime() > now) return previousDue;
  if (misses >= 3 && previousDue) {
    if (lastMiss && now < lastMiss.getTime() + 86_400_000) return new Date(lastMiss.getTime() + 86_400_000);
  }
  return weight > 0 ? new Date(now + 86_400_000) : null;
}
/** Overdue untested tags remain due; successful retrieval clears or advances their dates. */
export function earliestReview(maintenance: Date | null, errors: { reviewAt: Date | null }[]): Date | null {
  const dates = [maintenance, ...errors.map((e) => e.reviewAt)].filter((d): d is Date => d !== null);
  return dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null;
}
export function canMix(state: TopicState) {
  return ["PRODUCTION_PRACTICE", "85_PERCENT_REACHED", "MAINTENANCE", "AUTOMATIC", "REVISIT_REQUIRED"].includes(state);
}
export function prerequisiteReady(state: TopicState) {
  return ["85_PERCENT_REACHED", "MAINTENANCE", "AUTOMATIC"].includes(state);
}

export interface MixedCandidate { id: string; state: TopicState; priority: number; dueAt: Date | null; maintenanceDueAt?: Date | null; errorWeight: number; lastStudiedAt?: Date | null }
/** Ten cards: two old, four current, two mixed and two oral. Never pull unstudied topics. */
export function dailyPlan(candidates: MixedCandidate[]): { topicId: string; stage: "mixed" | "production" | "oral" }[] {
  const eligible = candidates.filter((c) => canMix(c.state));
  if (!eligible.length) return [];
  const ranked = [...eligible].sort((a, b) => b.errorWeight - a.errorWeight || (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity) || b.priority - a.priority);
  const current = ranked.filter((c) => ["REVISIT_REQUIRED", "PRODUCTION_PRACTICE"].includes(c.state))
    .sort((a, b) => (b.lastStudiedAt?.getTime() ?? 0) - (a.lastStudiedAt?.getTime() ?? 0))[0] ?? ranked[0];
  const dueMaintained = (c: MixedCandidate) => {
    const date = c.maintenanceDueAt === undefined ? c.dueAt : c.maintenanceDueAt;
    return prerequisiteReady(c.state) && date !== null && date.getTime() <= Date.now();
  };
  const old = ranked.filter((c) => c.id !== current.id).sort((a, b) => Number(dueMaintained(b)) - Number(dueMaintained(a)));
  const pool = old.length ? old : ranked;
  // Oral work starts after written accuracy is demonstrated, never from imported coverage alone.
  const oral = ranked.filter((c) => prerequisiteReady(c.state));
  const oralPool = oral.length ? oral : pool;
  return [
    ...Array.from({ length: 2 }, () => ({ topicId: pool[0].id, stage: "mixed" as const })),
    ...Array.from({ length: 4 }, () => ({ topicId: current.id, stage: "production" as const })),
    ...Array.from({ length: 2 }, (_, i) => ({ topicId: pool[(i + 1) % pool.length].id, stage: "mixed" as const })),
    ...Array.from({ length: 2 }, (_, i) => ({ topicId: oralPool[i % oralPool.length].id, stage: oral.length ? "oral" as const : "mixed" as const })),
  ];
}
