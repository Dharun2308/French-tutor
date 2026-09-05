/** Checks the installed official files and serving route; does not touch the database. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { GET, HEAD } from "../src/app/api/language-transfer/[lesson]/route";
import { FRENCH_LESSONS } from "../src/lib/language-transfer";

async function main() {
  assert.deepEqual(FRENCH_LESSONS.map((l) => l.number), Array.from({ length: 40 }, (_, i) => i + 1));
  for (const lesson of FRENCH_LESSONS) {
    const source = await readFile(`audio/language-transfer-french/${String(lesson.number).padStart(2, "0")}.mp3`);
    assert.equal(source.length, lesson.bytes);
    assert.equal(createHash("sha256").update(source).digest("hex"), lesson.sha256);
    const context = { params: Promise.resolve({ lesson: String(lesson.number) }) };
    const head = await HEAD(new Request("http://localhost/audio"), context);
    assert.equal(head.status, 200); assert.equal(head.headers.get("content-length"), String(source.length));
    for (const [range, expected] of [["bytes=0-1", source.subarray(0, 2)], ["bytes=1000-1999", source.subarray(1000, 2000)], ["bytes=-20", source.subarray(-20)]] as const) {
      const response = await GET(new Request("http://localhost/audio", { headers: { range } }), context);
      assert.equal(response.status, 206);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
    }
    const invalid = await GET(new Request("http://localhost/audio", { headers: { range: `bytes=${source.length}-` } }), context);
    assert.equal(invalid.status, 416);
  }
  for (const id of ["0", "41", "../local.db", "1.mp3"]) {
    assert.equal((await GET(new Request("http://localhost/audio"), { params: Promise.resolve({ lesson: id }) })).status, 404);
  }
  console.log("All 40 official MP3 hashes, metadata responses, seek ranges and invalid requests verified.");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
