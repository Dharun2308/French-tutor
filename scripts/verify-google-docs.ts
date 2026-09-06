// Use an explicitly configured disposable DB copied from production; never run against live data.
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { importBatches, learningItems } from "../src/lib/db/schema";
import { POST } from "../src/app/api/import/google-docs/route";
import { GET } from "../src/app/api/import/batches/route";
import { POST as extract } from "../src/app/api/import/extract/route";

async function main() {
  assert.match(process.env.TURSO_DATABASE_URL ?? "", /^file:\/tmp\//, "requires disposable /tmp database");
  const before = await db.select().from(learningItems);
  const body = { documentId: "fixture-document-id-123456789", tabId: "first", title: "Fixture lesson", text: "Je parle français.\nI speak French." };
  const register = (data = body) => POST(new NextRequest("http://localhost/api/import/google-docs", { method: "POST", body: JSON.stringify(data) }));
  const first = await (await register()).json();
  const repeated = await Promise.all(Array.from({ length: 5 }, async () => (await register()).json()));
  assert.ok(repeated.every((r) => r.batchId === first.batchId));
  const detail = await (await GET(new NextRequest(`http://localhost/api/import/batches?id=${first.batchId}`))).json();
  assert.equal(detail.rawText, body.text);
  assert.equal(detail.sourceUrl, `https://docs.google.com/document/d/${body.documentId}/edit`);
  assert.equal(detail.prepared, false);
  const prepared = { lesson_summary: "Saved review draft", items: [] };
  await db.update(importBatches).set({ extractedJson: prepared }).where(eq(importBatches.id, first.batchId));
  const retry = await extract(new NextRequest("http://localhost/api/import/extract", { method: "POST", body: JSON.stringify({ batchId: first.batchId }) }));
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).alreadyPrepared, true, "retry must not overwrite a prepared draft");
  await db.update(importBatches).set({ status: "discarded" }).where(eq(importBatches.id, first.batchId));
  assert.equal((await (await register()).json()).batchId, first.batchId);
  const edited = await (await register({ ...body, text: "Je comprends le français." })).json();
  assert.notEqual(edited.batchId, first.batchId);
  const concurrent = await Promise.all(Array.from({ length: 5 }, async () => (await register({ ...body, text: "Un autre exemple." })).json()));
  assert.equal(new Set(concurrent.map((r) => r.batchId)).size, 1, "concurrent first delivery creates one batch");
  assert.equal((await register({ ...body, documentId: "../../bad" })).status, 400);
  assert.deepEqual(await db.select().from(learningItems), before, "sync leaves learner items unchanged");
  console.log("Google Docs intake: concurrent/lost-response retries, source links, draft preservation, changed notes and learner-data isolation passed.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
