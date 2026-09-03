/**
 * Destructive Phase 3 integration check. Run only against a disposable migrated
 * database via TURSO_DATABASE_URL=file:/absolute/path/test.db.
 */
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { errorPatterns, itemReviews, learningItems, tutorUsageEvents } from "../src/lib/db/schema";
import { changeActiveItem, getActiveItems } from "../src/lib/items/active";
import { rankWeakItems } from "../src/lib/items/weak";
import { POST as saveTutorUsage } from "../src/app/api/tutor/usage/route";
import { POST as saveReview } from "../src/app/api/items/review/route";
import { GET as getErrorPatterns } from "../src/app/api/error-patterns/route";

const dbUrl = process.env.TURSO_DATABASE_URL ?? "";
if (!dbUrl.startsWith("file:/tmp/")) {
  throw new Error("Refusing to run: TURSO_DATABASE_URL must point to a disposable file under /tmp.");
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

for (let i = 0; i < 2; i++) {
  const response = await saveReview(
    new NextRequest("http://localhost/api/items/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        itemId: tutorItem.id,
        rating: 0,
        direction: "production",
        verdict: "WRONG",
        errorType: "article",
        userAnswer: "à le restaurant",
        correctedAnswer: "au restaurant",
        gradeReason: "Use au for à + le.",
        gradedBy: "local",
      }),
    })
  );
  assert.equal(response.status, 200);
}
const savedReviews = await db
  .select()
  .from(itemReviews)
  .where(eq(itemReviews.itemId, tutorItem.id));
assert.ok(savedReviews.some((review) => review.errorType === "article"));
const patternRows = await db
  .select()
  .from(errorPatterns)
  .where(eq(errorPatterns.errorType, "article"));
assert.equal(patternRows[0]?.totalCount, 2);

const patternsResponse = await getErrorPatterns();
const patternsBody = await patternsResponse.json();
assert.ok(patternsBody.patterns.some((pattern: { errorType: string; count: number }) => pattern.errorType === "article" && pattern.count >= 2));

console.log(
  JSON.stringify({
    ranking: ranking.length,
    active: active.items.length,
    tutorRetryIdempotent: true,
    recurringPattern: true,
  })
);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
