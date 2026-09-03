import { test } from "node:test";
import assert from "node:assert/strict";
import { ExtractionSchema } from "../src/lib/import/extract-prompt";

const item = {
  french: "au restaurant",
  english: "at / to the restaurant",
  example_fr: "On va au restaurant ce soir.",
  example_en: "We're going to the restaurant tonight.",
  type: "correction",
  grammar_topic: "à + le → au",
  cefr_level: "A1",
  priority: 5,
  confidence: 0.95,
  source_context: "à le restaurant",
  handwriting_note: "",
};

test("parses a well-formed extraction", () => {
  const r = ExtractionSchema.parse({ lesson_summary: "Restaurant", items: [item] });
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].priority, 5);
});

test("clamps out-of-range priority / confidence instead of rejecting", () => {
  const r = ExtractionSchema.parse({
    lesson_summary: "x",
    items: [{ ...item, priority: 9, confidence: 1.4 }, { ...item, priority: 0, confidence: -1 }],
  });
  assert.equal(r.items[0].priority, 5);
  assert.equal(r.items[0].confidence, 1);
  assert.equal(r.items[1].priority, 1);
  assert.equal(r.items[1].confidence, 0);
});

test("rejects an unknown item type", () => {
  assert.throws(() =>
    ExtractionSchema.parse({ lesson_summary: "x", items: [{ ...item, type: "idiom" }] })
  );
});

test("rejects an empty french field", () => {
  assert.throws(() =>
    ExtractionSchema.parse({ lesson_summary: "x", items: [{ ...item, french: "" }] })
  );
});
