/** Run against a disposable copy of a migrated DB: TURSO_DATABASE_URL=file:/tmp/... */
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { focusSessions, learningItems, tutorUsageEvents } from "../src/lib/db/schema";
import { getWeeklyPracticeIds } from "../src/lib/items/weekly-practice-server";
import { GET as smart } from "../src/app/api/items/session/route";
import { GET as focus } from "../src/app/api/focus-session/route";
import { POST as review } from "../src/app/api/items/review/route";
import { POST as grade } from "../src/app/api/ai/grade-item/route";

async function main() {
  assert.ok(process.env.TURSO_DATABASE_URL?.startsWith("file:/tmp/"), "Disposable /tmp database required");
  const before = await db.select().from(tutorUsageEvents);
  const weekly = await getWeeklyPracticeIds();
  assert.ok(weekly.length >= 5, "Fixture needs at least five weekly phrases");
  const response = await smart(new NextRequest("http://localhost/api/items/session?count=4"));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.items.length, 4);
  assert.deepEqual(data.items.map((i: { id: number }) => i.id), weekly.slice(0, 4));
  const first = data.items[0];
  assert.ok(first.promptEn && first.targetFr && first.weekly);
  const graded = await grade(new NextRequest("http://localhost/api/ai/grade-item", {
    method: "POST", body: JSON.stringify({ itemId: first.id, attempt: first.targetFr, direction: "production" }),
  }));
  assert.equal(graded.status, 200);
  assert.equal((await graded.json()).verdict, "CORRECT");
  const body = { requestId: "weekly-practice-integration", itemId: first.id, rating: 2, direction: "production", verdict: "CORRECT", userAnswer: first.targetFr };
  for (let n = 0; n < 2; n++) {
    const saved = await review(new NextRequest("http://localhost/api/items/review", { method: "POST", body: JSON.stringify(body) }));
    assert.equal(saved.status, 200);
    if (n) assert.equal((await saved.json()).idempotent, true);
  }
  assert.equal((await getWeeklyPracticeIds()).at(-1), first.id);
  assert.equal((await db.select().from(tutorUsageEvents)).length, before.length);
  await db.update(learningItems).set({ suspended: true }).where(eq(learningItems.id, first.id));
  const filtered = await (await smart(new NextRequest("http://localhost/api/items/session?count=10"))).json();
  assert.ok(filtered.items.every((item: { id: number }) => item.id !== first.id));
  await db.delete(focusSessions);
  const plan = await (await focus()).json();
  assert.equal(plan.items.filter((i: { source: string }) => i.source === "weekly").length, 3);
  assert.equal(plan.items.filter((i: { direction: string }) => i.direction === "listening").length, 2);
  assert.equal(new Set(plan.items.map((i: { id: number }) => i.id)).size, plan.items.length);
  assert.ok(plan.items.every((i: { id: number }) => i.id !== first.id));
  const resumed = await (await focus()).json();
  assert.equal(resumed.sessionId, plan.sessionId);
  assert.deepEqual(resumed.items, plan.items);
  console.log("Weekly integration passed: selection, exact grading, idempotent saves, rotation, suspension, Focus mix and resume.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
