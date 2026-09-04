/**
 * Destructive Phase 3 integration check. Run only against a disposable migrated
 * database via TURSO_DATABASE_URL=file:/absolute/path/test.db.
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { errorPatterns, importBatches, itemReviews, learningItems, tutorUsageEvents } from "../src/lib/db/schema";
import { changeActiveItem, getActiveItems } from "../src/lib/items/active";
import { rankWeakItems } from "../src/lib/items/weak";
import { POST as saveTutorUsage } from "../src/app/api/tutor/usage/route";
import { POST as saveReview } from "../src/app/api/items/review/route";
import { GET as getErrorPatterns } from "../src/app/api/error-patterns/route";
import { POST as commitImport } from "../src/app/api/import/commit/route";
import { PATCH as patchImport } from "../src/app/api/import/batches/route";

const dbUrl = process.env.TURSO_DATABASE_URL ?? "";
if (!dbUrl.startsWith("file:/tmp/")) {
  throw new Error("Refusing to run: TURSO_DATABASE_URL must point to a disposable file under /tmp.");
}
const uploadsDir = process.env.UPLOADS_DIR ?? "";
if (!uploadsDir.startsWith("/tmp/")) {
  throw new Error("Refusing to run: UPLOADS_DIR must point to a disposable directory under /tmp.");
}

async function main() {
const ranking = await rankWeakItems();
assert.equal(ranking.length, 14);

let active = await getActiveItems();
assert.equal(active.items.length, 10);
assert.equal(new Set(active.items.map((item) => item.id)).size, 10);

const firstId = active.items[0].id;
active = await changeActiveItem("pin", firstId);
assert.equal(active.items.find((item) => item.id === firstId)?.pinned, true);
active = await changeActiveItem("unpin", firstId);
assert.equal(active.items.find((item) => item.id === firstId)?.pinned, false);

const replacedId = active.items[0].id;
active = await changeActiveItem("replace", replacedId);
assert.equal(active.items.length, 10);
assert.ok(!active.items.some((item) => item.id === replacedId));

const tutorItem = active.items[0];
const [before] = await db
  .select({ count: learningItems.spontaneousUsageCount })
  .from(learningItems)
  .where(eq(learningItems.id, tutorItem.id));
const tutorBody = {
  submissionId: "00000000-0000-4000-8000-000000000003",
  weekStart: active.weekStart.toISOString(),
  entries: [{ itemId: tutorItem.id, outcome: "natural" }],
};
for (let attempt = 0; attempt < 2; attempt++) {
  const response = await saveTutorUsage(
    new NextRequest("http://localhost/api/tutor/usage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(tutorBody),
    })
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.saved, 1);
  assert.equal(body.outcomes.natural, 1);
  assert.equal(body.inserted, attempt === 0 ? 1 : 0);
}
const [after] = await db
  .select({ count: learningItems.spontaneousUsageCount })
  .from(learningItems)
  .where(eq(learningItems.id, tutorItem.id));
assert.equal(after.count, before.count + 1);
assert.equal(
  (
    await db
      .select()
      .from(tutorUsageEvents)
      .where(eq(tutorUsageEvents.submissionId, tutorBody.submissionId))
  ).length,
  1
);

const reviewBody = {
  requestId: "00000000-0000-4000-8000-000000000013",
  itemId: tutorItem.id,
  rating: 0,
  direction: "production",
  verdict: "WRONG",
  errorType: "article",
  userAnswer: "à le restaurant",
  correctedAnswer: "au restaurant",
  gradeReason: "Use au for à + le.",
  gradedBy: "local",
  elapsedMs: 4_000_000,
};
for (let i = 0; i < 2; i++) {
  const response = await saveReview(
    new NextRequest("http://localhost/api/items/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(reviewBody),
    })
  );
  assert.equal(response.status, 200);
  const responseBody = await response.json();
  assert.equal(responseBody.idempotent, i === 1);
}
const secondResponse = await saveReview(
  new NextRequest("http://localhost/api/items/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...reviewBody, requestId: "00000000-0000-4000-8000-000000000014" }),
  })
);
assert.equal(secondResponse.status, 200);

// Reveal/"I don't know" has no grader error type and must not create a pattern.
const revealResponse = await saveReview(
  new NextRequest("http://localhost/api/items/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requestId: "00000000-0000-4000-8000-000000000015",
      itemId: tutorItem.id,
      rating: 0,
      direction: "production",
      verdict: "WRONG",
      gradedBy: "local",
    }),
  })
);
assert.equal(revealResponse.status, 200);
const savedReviews = await db
  .select()
  .from(itemReviews)
  .where(eq(itemReviews.itemId, tutorItem.id));
assert.ok(savedReviews.some((review) => review.errorType === "article"));
assert.equal(savedReviews.filter((review) => review.requestId === reviewBody.requestId).length, 1);
assert.equal(savedReviews.find((review) => review.requestId === reviewBody.requestId)?.elapsedMs, 3_600_000);
const patternRows = await db
  .select()
  .from(errorPatterns)
  .where(eq(errorPatterns.errorType, "article"));
assert.equal(patternRows[0]?.totalCount, 2);

const patternsResponse = await getErrorPatterns();
const patternsBody = await patternsResponse.json();
assert.ok(patternsBody.patterns.some((pattern: { errorType: string; count: number }) => pattern.errorType === "article" && pattern.count >= 2));

const [commitBatch] = await db
  .insert(importBatches)
  .values({ sourceKind: "text", rawText: "verification" })
  .returning({ id: importBatches.id });
const commitBody = {
  batchId: commitBatch.id,
  items: [{
    french: "vérification transactionnelle unique",
    english: "unique transactional verification",
    example_fr: "Ceci est une vérification transactionnelle unique.",
    example_en: "This is a unique transactional verification.",
    type: "phrase",
    grammar_topic: "",
    cefr_level: "A2",
    priority: 1,
    source_context: "integration test",
  }],
};
const firstCommit = await commitImport(new NextRequest("http://localhost/api/import/commit", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(commitBody),
}));
assert.equal(firstCommit.status, 200);
const repeatedCommit = await commitImport(new NextRequest("http://localhost/api/import/commit", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(commitBody),
}));
assert.equal(repeatedCommit.status, 409);

const [discardBatch] = await db
  .insert(importBatches)
  .values({ sourceKind: "photo", imageFiles: ["0.jpg"] })
  .returning({ id: importBatches.id });
const discardDir = path.join(uploadsDir, String(discardBatch.id));
await fs.mkdir(discardDir, { recursive: true });
await fs.writeFile(path.join(discardDir, "0.jpg"), "verification");
const discardResponse = await patchImport(new NextRequest("http://localhost/api/import/batches", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ id: discardBatch.id, status: "discarded" }),
}));
assert.equal(discardResponse.status, 200);
await assert.rejects(fs.access(discardDir));

console.log(
  JSON.stringify({
    ranking: ranking.length,
    active: active.items.length,
    tutorRetryIdempotent: true,
    reviewRetryIdempotent: true,
    elapsedClamped: true,
    revealExcludedFromPatterns: true,
    recurringPattern: true,
    importCommitIdempotent: true,
    discardedPhotosRemoved: true,
  })
);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
