import assert from "node:assert/strict";
import { test } from "node:test";
import { addSmartFollowUp, selectSmartSources } from "../src/lib/smart/plan";
import { smartExerciseSchema } from "../src/lib/smart/exercise";
import type { SmartData, SmartSource } from "../src/lib/smart/types";

const source = (kind: SmartSource["kind"], id: number, score = id): SmartSource => ({
  kind, id, key: `${kind}:${id}`, group: `${kind}:${id}`, score, level: "A1", label: kind,
  reason: "Due", prompt: "I am happy.", target: "Je suis content.", topic: "agreement", evidence: [],
});

test("Smart selection reserves a mix, prioritizes evidence and bounds verb repetition", () => {
  const personal = [source("personal", 1, 90), source("personal", 2, 10), source("personal", 3, 30)];
  const verbs = Array.from({ length: 8 }, (_, i) => ({ ...source("verb", i + 1, 1000 - i), group: "one-verb" }));
  const result = selectSmartSources([...verbs, ...personal, source("phrase", 1)], 16);
  assert.deepEqual(result.slice(0, 4).map(s => s.key), ["personal:1", "phrase:1", "verb:1", "personal:3"]);
  assert.equal(result.filter(s => s.kind === "verb").length, 2);
  assert.equal(new Set(result.map(s => s.key)).size, result.length);
  assert.deepEqual(selectSmartSources([], 10), []);
});

test("Only independent misses add spaced follow-ups; retries and remediation are bounded", () => {
  const data: SmartData = { version: 1, sources: [], history: [], index: 0, queue: Array.from({ length: 6 }, (_, i) => ({
    id: `q${i}`, sourceKey: `personal:${i}`, followUp: false,
    attempt: { answer: "x", rating: 0, elapsedMs: 0, scheduled: true, grade: { verdict: "WRONG", corrected: "y", explanation: "Rule", errorType: "agreement", provider: "fixture" } },
  })) };
  assert.equal(addSmartFollowUp(data, "q0", "retry0"), true);
  assert.equal(data.queue[3].id, "retry0");
  assert.equal(addSmartFollowUp(data, "q0", "duplicate"), false);
  assert.equal(addSmartFollowUp(data, "retry0", "recursive"), false);
  assert.equal(addSmartFollowUp(data, "q1", "retry1"), true);
  assert.equal(addSmartFollowUp(data, "q2", "retry2"), true);
  assert.equal(addSmartFollowUp(data, "q3", "retry3"), false);
  const ungraded = { ...data, queue: [{ ...data.queue[0], attempt: { ...data.queue[0].attempt!, rating: null } }] };
  assert.equal(addSmartFollowUp(ungraded, "q0", "ungraded"), false);
});

test("Generated exercises reject wrong source, repeats, leaked answers and wrong conjugation", () => {
  const verb = { ...source("verb", 1), verb: { infinitive: "être", tense: "present", person: "1s", form: "suis" } };
  const schema = smartExerciseSchema(verb, [{ prompt: "I am tired.", target: "Je suis fatigué." }]);
  const valid = { sourceKey: verb.key, prompt: "Use être: I am ready to leave.", target: "Je suis prêt à partir.", rubric: "Use first person present." };
  assert.equal(schema.safeParse(valid).success, true);
  assert.equal(schema.safeParse({ ...valid, sourceKey: "verb:999" }).success, false);
  assert.equal(schema.safeParse({ ...valid, target: "Il est prêt à partir." }).success, false);
  assert.equal(schema.safeParse({ ...valid, prompt: "Translate Je suis prêt à partir." }).success, false);
  assert.equal(schema.safeParse({ ...valid, target: "JE SUIS FATIGUÉ!" }).success, false);
  assert.equal(schema.safeParse({ ...valid, target: "Je suis content." }).success, false);
});
