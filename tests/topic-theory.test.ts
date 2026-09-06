import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { TOPICS } from "../src/lib/curriculum/catalog";
import { readReferenceTheory } from "../src/lib/curriculum/theory";

const result = { provider: "fixture", theory: {
  meaning: "A direct object receives the action.", usage: "Replace a known noun to avoid repetition.",
  formation: "Put le, la or les before the conjugated verb.", caution: "Le and la become l’ before a vowel sound.",
  examples: [{ french: "Je le vois.", english: "I see him." }, { french: "Je la vois.", english: "I see her." }], teachBack: "",
} };

test("reference theory is shared across concurrent reads and survives later visits", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "french-theory-"));
  let calls = 0;
  const generate = async () => { calls++; return result; };
  try {
    const values = await Promise.all(Array.from({ length: 5 }, () => readReferenceTheory("direct-objects", generate, directory)));
    assert.equal(calls, 1);
    values.forEach((value) => assert.deepEqual(value, result));
    assert.deepEqual(await readReferenceTheory("direct-objects", generate, directory), result);
    assert.equal(calls, 1);
    const files = await readdir(directory);
    assert.equal(files.length, 1);
    await writeFile(path.join(directory, files[0]), '{"theory":{}}');
    assert.deepEqual(await readReferenceTheory("direct-objects", generate, directory), result);
    assert.equal(calls, 2, "invalid cache is regenerated");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("every catalog topic can be read without a practice session or prerequisite check", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "french-theory-catalog-"));
  try {
    for (const topic of TOPICS) {
      assert.deepEqual(await readReferenceTheory(topic.id, async (requested) => {
        assert.equal(requested.id, topic.id);
        return result;
      }, directory), result);
    }
    await assert.rejects(readReferenceTheory("../invalid", async () => { throw new Error("must not generate"); }, directory), /Topic not found/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("a failed generation is not cached and can be retried", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "french-theory-retry-"));
  try {
    await assert.rejects(readReferenceTheory("direct-objects", async () => { throw new Error("provider unavailable"); }, directory), /provider unavailable/);
    assert.deepEqual(await readdir(directory), []);
    assert.deepEqual(await readReferenceTheory("direct-objects", async () => result, directory), result);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
