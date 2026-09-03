import { test } from "node:test";
import assert from "node:assert/strict";
import { looseKey, normKey, splitVariants } from "../src/lib/import/norm-key";

test("normKey collapses case, punctuation, whitespace and apostrophe style", () => {
  assert.equal(normKey("Pas encore."), "pas encore");
  assert.equal(normKey("pas encore"), "pas encore");
  assert.equal(normKey("  PAS   ENCORE ! "), "pas encore");
  assert.equal(normKey("J’ai besoin de…"), "j'ai besoin de");
  assert.equal(normKey("j'ai besoin de"), "j'ai besoin de");
  assert.equal(normKey("Quel temps fait-il ?"), "quel temps fait-il");
});

test("normKey drops teaching annotations", () => {
  assert.equal(normKey("l'œuf (m.)"), "l'œuf");
  assert.equal(normKey("pas encore (adv.)"), "pas encore");
});

test("normKey keeps accents — pêcher and pécher are different words", () => {
  assert.notEqual(normKey("pêcher"), normKey("pécher"));
  assert.notEqual(normKey("mangé"), normKey("manger"));
});

test("looseKey is accent-insensitive (warn-only key)", () => {
  assert.equal(looseKey("pêcher"), looseKey("pécher"));
  assert.equal(looseKey("Ça dépend."), "ca depend");
});

test("normKey normalises hyphen spacing", () => {
  assert.equal(normKey("peut - être"), normKey("peut-être"));
});

test("splitVariants indexes each part of a seeded variant string", () => {
  assert.deepEqual(splitVariants("bleu / bleue"), ["bleu / bleue", "bleu", "bleue"]);
  assert.deepEqual(splitVariants("la France — en France"), [
    "la France — en France",
    "la France",
    "en France",
  ]);
  assert.deepEqual(splitVariants("bonjour"), ["bonjour"]);
});
