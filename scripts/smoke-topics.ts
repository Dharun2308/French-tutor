/** Explicit real-provider smoke test. Stores provider events only in a disposable DB. */
import assert from "node:assert/strict";
import { generateQuestions, generateTheory, gradeQuestion } from "../src/lib/curriculum/ai";
import { TOPIC_BY_ID } from "../src/lib/curriculum/catalog";
import type { Question } from "../src/lib/curriculum/types";

async function main() {
  assert.ok(process.env.TURSO_DATABASE_URL?.startsWith("file:/tmp/"), "Disposable /tmp database required");
  const result = await generateTheory(TOPIC_BY_ID.get("direct-objects")!);
  console.log("Theory:", result.provider, JSON.stringify(result.theory));
  const questions = await generateQuestions(Array.from({ length: 5 }, (_, i) => ({ topicId: "direct-objects", stage: "controlled" as const, ...(i === 0 ? { tag: "PRONOUN_PLACEMENT" as const } : {}) })), [], ["PRONOUN_PLACEMENT", "OTHER"]);
  assert.equal(questions.questions[0].tag, "PRONOUN_PLACEMENT");
  console.log("Questions:", questions.provider, JSON.stringify(questions.questions.map(({ prompt, answer }) => ({ prompt, answer }))));
  const question: Question = { id: "smoke-only", topicId: "adjective-number", stage: "production", prompt: "Translate: My sisters are happy.", answer: "Mes sœurs sont heureuses.", hint: "Check gender and number.", rule: "Feminine plural agreement.", tag: "GENDER_NUMBER_AGREEMENT", audio: "", hinted: false, remediation: false };
  const [minor, wrong] = await Promise.all([gradeQuestion(question, "Mes soeurs sont heureuses."), gradeQuestion(question, "Mes sœurs sont heureux.")]);
  assert.equal(minor.grade.conceptCorrect, true);
  assert.equal(wrong.grade.conceptCorrect, false);
  console.log("Minor slip:", JSON.stringify(minor));
  console.log("Conceptual error:", JSON.stringify(wrong));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
