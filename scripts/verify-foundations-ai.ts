// Optional real-provider smoke test. Uses subscription CLIs and a disposable DB only.
import assert from "node:assert/strict";
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  assert.match(process.env.TURSO_DATABASE_URL ?? "", /^file:\/tmp\//);
  assert.equal(process.env.CODEX_REASONING_EFFORT || "medium", "medium");
  const { db } = await import("../src/lib/db/client");
  const { settings } = await import("../src/lib/db/schema");
  const { foundationsAI } = await import("../src/lib/foundations/ai");
  const { recallMemory } = await import("../src/lib/foundations/plan");
  const { wordCount, isSimpleFoundationsFrench, foundationsWordLimit } = await import("../src/lib/foundations/level");
  const history: { prompt: string; target: string }[] = [];
  for (const provider of ["codex", "claude"] as const) {
    await db.update(settings).set({ extractProviders: { codex: provider === "codex", claude: provider === "claude", openai: false } });
    const source = {
      kind: provider === "codex" ? "personal" as const : "phrase" as const,
      id: 1, key: provider === "codex" ? "personal:1" : "phrase:1", group: "partitive", score: 40, level: "A1",
      label: "Partitive articles", reason: "Repeated article mistakes", prompt: "some water", target: "de l’eau", topic: "partitive articles before vowels", evidence: ["Hard: Je bois de eau. → Je bois de l’eau. Use de l’ before a vowel."],
      dueAt: new Date(0).toISOString(), reviewed: true,
      memory: recallMemory([{ rating: 1, ratedAt: new Date() }]), challenge: "standard" as const,
    };
    const exercise = await foundationsAI.generate(source, history, ["present"], source.evidence);
    assert.equal(exercise.provider, provider);
    assert.ok(isSimpleFoundationsFrench(exercise.target));
    assert.match(exercise.prompt, /^Translate:/i);
    assert.ok(wordCount(exercise.prompt) <= 12);
    assert.match(exercise.target, /(?:de\s+l[’']eau|d[’']eau)/i);
    history.push(exercise);
    console.log(provider, "generation:", JSON.stringify(exercise));
    for (const target of ["J’en ai 3", "Je n’en ai jamais eu", "Je ne m’y suis pas intéressé"]) {
      await assert.rejects(foundationsAI.generate({ ...source, target, level: "A2" }, [], ["present"], []), /short A1 or A2 source/);
    }
    // Repeated misses on A2 sources must simplify the context, including when past feedback is complex.
    for (const entry of [
      { target: "un maillot", prompt: "a jersey", topic: "clothing", challenge: "supported" as const },
      { target: "en face de", prompt: "opposite", topic: "location", challenge: "standard" as const },
      { target: "nous avons joué au golf", prompt: "we played golf", topic: "simple past activity", challenge: "supported" as const },
    ]) {
      const a2 = { ...source, ...entry, level: "A2", evidence: ["Again: Je n’en ai jamais eu. Use en before the compound tense."], memory: recallMemory([{ rating: 0, ratedAt: new Date() }, { rating: 1, ratedAt: new Date() }]) };
      const simple = await foundationsAI.generate(a2, [], ["present"], a2.evidence);
      assert.equal(simple.provider, provider);
      assert.ok(isSimpleFoundationsFrench(simple.target));
      assert.ok(wordCount(simple.target) <= foundationsWordLimit(a2));
      console.log(provider, "A2", entry.challenge, JSON.stringify({ prompt: simple.prompt, target: simple.target }));
    }
    const fixed = { prompt: "Write in French: I drink some water with my meal.", target: "Je bois de l’eau avec mon repas.", rubric: "Use boire in the present and the partitive before eau. Natural word-order alternatives are valid.", provider, fallback: false };
    const alternate = await foundationsAI.grade(source, fixed, "Avec mon repas, je bois de l'eau.");
    assert.equal(alternate.provider, provider);
    assert.equal(alternate.verdict, "CORRECT");
    const mistake = await foundationsAI.grade(source, fixed, "Je bois de eau avec mon repas.");
    assert.equal(mistake.provider, provider);
    assert.equal(mistake.verdict, "WRONG");
    console.log(provider, "accepts alternate French; catches article error:", mistake.explanation);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
