import type { SmartData, SmartSource } from "./types";

/** Reserve lesson recall, foundations and verbs; avoid a single verb taking over. */
export function selectSmartSources(candidates: SmartSource[], target: number): SmartSource[] {
  const pools = {
    personal: candidates.filter(c => c.kind === "personal"),
    phrase: candidates.filter(c => c.kind === "phrase"),
    verb: candidates.filter(c => c.kind === "verb"),
  };
  for (const pool of Object.values(pools)) pool.sort((a, b) => b.score - a.score || a.id - b.id);
  const chosen: SmartSource[] = [];
  const used = new Set<string>();
  const groups = new Map<string, number>();
  const order = ["personal", "phrase", "verb", "personal"] as const;
  while (chosen.length < target) {
    const before = chosen.length;
    for (const kind of order) {
      if (chosen.length >= target) break;
      const next = pools[kind].find(c => !used.has(c.key) && (kind !== "verb" || (groups.get(c.group) ?? 0) < 2));
      if (!next) continue;
      chosen.push(next);
      used.add(next.key);
      groups.set(next.group, (groups.get(next.group) ?? 0) + 1);
    }
    if (before === chosen.length) break;
  }
  return chosen;
}

/** A miss gets one transfer check after two other questions, with a session cap. */
export function addSmartFollowUp(data: SmartData, questionId: string, newId: string): boolean {
  const index = data.queue.findIndex(q => q.id === questionId);
  const question = data.queue[index];
  if (!question?.attempt || question.followUp || question.attempt.rating === null || question.attempt.rating >= 2) return false;
  if (data.queue.filter(q => q.followUp).length >= 3 || data.queue.some(q => q.followUp && q.sourceKey === question.sourceKey)) return false;
  data.queue.splice(Math.min(index + 3, data.queue.length), 0, { id: newId, sourceKey: question.sourceKey, followUp: true });
  return true;
}
