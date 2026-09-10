import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileByteStream } from "../src/lib/file-byte-stream";

test("file streams preserve ranges and tolerate cancellation during reads", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "french-stream-test-"));
  const file = path.join(directory, "audio.bin");
  const bytes = Buffer.alloc(200_000);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  try {
    await writeFile(file, bytes);
    const full = await fileByteStream(file, 0, bytes.length - 1);
    assert.deepEqual(Buffer.from(await new Response(full).arrayBuffer()), bytes);
    const partial = await fileByteStream(file, 997, 79_999);
    assert.deepEqual(Buffer.from(await new Response(partial).arrayBuffer()), bytes.subarray(997, 80_000));
    for (let i = 0; i < 40; i++) {
      const reader = (await fileByteStream(file, 0, bytes.length - 1)).getReader();
      const reading = reader.read();
      if (i % 2) await reading;
      await reader.cancel();
      await reading;
      assert.equal((await reader.read()).done, true);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
