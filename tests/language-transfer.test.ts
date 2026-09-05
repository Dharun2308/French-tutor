import { test } from "node:test";
import assert from "node:assert/strict";
import { audioRange } from "../src/lib/audio-range";
import { FRENCH_LESSONS, readListeningLibrary } from "../src/lib/language-transfer";

test("audio seeking supports initial probes, open-ended and suffix ranges", () => {
  assert.equal(audioRange(null, 1000), null);
  assert.deepEqual(audioRange("bytes=0-1", 1000), { start: 0, end: 1 });
  assert.deepEqual(audioRange("bytes=500-", 1000), { start: 500, end: 999 });
  assert.deepEqual(audioRange("bytes=-100", 1000), { start: 900, end: 999 });
  assert.deepEqual(audioRange("bytes=500-1500", 1000), { start: 500, end: 999 });
  for (const value of ["bytes=1000-", "bytes=500-100", "bytes=-0", "bytes=-", "bytes=0-1,4-5", "bytes=99999999999999999-"]) {
    assert.equal(audioRange(value, 1000), "invalid", value);
  }
});

test("listening resume handles stale, corrupt and out-of-bounds browser storage", () => {
  assert.equal(readListeningLibrary("garbled").selected, 1);
  const saved = readListeningLibrary(JSON.stringify({ selected: 40, speed: 1.25, tracks: {
    1: { position: -20, completed: false }, 40: { position: 100000, completed: true },
    41: { position: 20, completed: true }, 2: { position: "oops", completed: true },
  } }));
  assert.equal(saved.selected, 40);
  assert.equal(saved.speed, 1.25);
  assert.equal(saved.tracks[1].position, 0);
  assert.equal(saved.tracks[40].position, FRENCH_LESSONS[39].duration);
  assert.equal(saved.tracks[40].completed, true);
  assert.equal(saved.tracks[41], undefined);
  assert.equal(saved.tracks[2], undefined);
  assert.equal(readListeningLibrary('{"selected":99,"speed":0}').speed, 1);
});
