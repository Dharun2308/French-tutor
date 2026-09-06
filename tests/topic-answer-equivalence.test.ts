import assert from "node:assert/strict";
import { test } from "node:test";
import { equivalentTopicAnswers } from "../src/lib/curriculum/answer-equivalence";

test("a missing final period is fully correct, including the reported negation answer", () => {
  assert.equal(equivalentTopicAnswers("Elle ne mange pas de soupe", "Elle ne mange pas de soupe."), true);
  assert.equal(equivalentTopicAnswers("Elle ne mange pas de soupe.", "Elle ne mange pas de soupe"), true);
  assert.equal(equivalentTopicAnswers("  ELLE ne mange  pas de soupe  ", "Elle ne mange pas de soupe."), true);
  assert.equal(equivalentTopicAnswers("Je n'ai pas de cafe\u0301", "Je n’ai pas de café."), true);
});

test("grammatical differences and meaningful punctuation still require grading", () => {
  for (const [answer, expected] of [
    ["Elle ne mange pas de la soupe", "Elle ne mange pas de soupe."],
    ["Elle ne manges pas de soupe", "Elle ne mange pas de soupe."],
    ["Il a manger", "Il a mangé."],
    ["Il va a Paris", "Il va à Paris."],
    ["Il vient", "Il vient ?"],
    ["Il vient...", "Il vient."],
    ["Cest bon", "C’est bon."],
    ["3.14", "314"],
    ["", "."],
  ]) assert.equal(equivalentTopicAnswers(answer, expected), false, `${answer} / ${expected}`);
});

test("the reported answer is graded locally without a slip or an AI call", async () => {
  process.env.TURSO_DATABASE_URL = "file::memory:";
  const { gradeQuestion } = await import("../src/lib/curriculum/ai");
  const question = { id: "period-regression", topicId: "article-negation", stage: "controlled" as const,
    prompt: "Rewrite the sentence in the negative: « Elle mange de la soupe. »",
    answer: "Elle ne mange pas de soupe.", hint: "", rule: "Use de after negation.",
    tag: "ARTICLE_NEGATION" as const, audio: "", remediation: false, hinted: false };
  const result = await gradeQuestion(question, "Elle ne mange pas de soupe");
  assert.equal(result.provider, "local");
  assert.deepEqual(result.grade, { conceptCorrect: true, corrected: question.answer,
    explanation: "Correct.", minorOnly: false, errorTags: [] });
});
