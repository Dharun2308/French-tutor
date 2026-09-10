// Live CLI-provider smoke checks, isolated from the learner's database and scores.
import assert from "node:assert/strict";
import { config } from "dotenv";
import type { SmartSource } from "../src/lib/smart/types";

async function main() {
  assert.match(process.env.TURSO_DATABASE_URL ?? "", /^file:\/tmp\//);
  config({ path: ".env.local" });
  const { db } = await import("../src/lib/db/client");
  const { settings } = await import("../src/lib/db/schema");
  const { generateSmartExercise, gradeSmartExercise } = await import("../src/lib/smart/ai");
  const { writeFile } = await import("node:fs/promises");
  const source: SmartSource = { key: "verb:1", kind: "verb", id: 1, group: "être", score: 50, label: "être · Présent", reason: "Recent conjugation errors", level: "A1", prompt: "I am happy.", target: "suis", topic: "present", evidence: ["The learner confused first and third person."], verb: { infinitive: "être", tense: "present", person: "1s", form: "suis" } };
  const outputs = [];
  for (const provider of ["codex", "claude"] as const) {
    await db.update(settings).set({ extractProviders: { codex: provider === "codex", claude: provider === "claude", openai: false } });
    const exercise = await generateSmartExercise(source, [], source.evidence);
    assert.equal(exercise.provider, provider);
    const wrong = await gradeSmartExercise(source, exercise, exercise.target.replace(/\bsuis\b/, "est"));
    assert.equal(wrong.verdict, "WRONG", `${provider} must catch a wrong person, even a short edit`);
    const alternate = await gradeSmartExercise(source, exercise, exercise.target.replace(/\b[Jj]e\b/, "Moi, je"));
    assert.equal(alternate.verdict, "CORRECT", `${provider} must accept valid alternate French`);
    outputs.push({ provider, exercise, wrong, alternate });
    console.log(`PASS ${provider}: fresh source-specific sentence, grammatical error detection, alternate French accepted.`);
  }
  await writeFile("/tmp/french-tutor-smart-20260909/provider-results.json", JSON.stringify(outputs, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
