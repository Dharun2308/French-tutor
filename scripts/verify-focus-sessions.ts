// Integration checks against an explicitly configured disposable copy, never the live DB.
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { focusSessions, itemReviews, itemVariations, learningItems } from "../src/lib/db/schema";
import { prepareFocusCard, serializeFocusSession } from "../src/lib/items/focus-session";
import { focusVariationSchema } from "../src/lib/items/focus-variation";
import { cardFor } from "../src/lib/items/card";
import { GET, POST } from "../src/app/api/focus-session/route";
import { POST as grade } from "../src/app/api/ai/grade-item/route";

async function main() {
  assert.match(process.env.TURSO_DATABASE_URL ?? "", /^file:\/tmp\//);
  const originalItems = await db.select().from(learningItems);
  const item = originalItems[0];
  assert.ok(item);
  const fixture = { promptEn: "Today, I would like a coffee without sugar.", targetFr: "Aujourd’hui, je voudrais un café sans sucre.", note: "Fixture", provider: "fixture", model: "fixture" };
  const create = async () => (await db.insert(focusSessions).values({ plan: [
    { itemId: item.id, direction: "production", source: "correction", freshContext: true },
  ] }).returning())[0];
  const session = await create();
  let calls = 0;
  const generate = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 20)); return fixture; };
  const results = await Promise.all(Array.from({ length: 4 }, () => prepareFocusCard(session.id, 0, generate)));
  assert.equal(calls, 1);
  const ready = results[0].items[0];
  assert.ok(ready.variationId);
  assert.ok(results.every(result => result.items[0].variationId === ready.variationId));
  assert.equal(ready.targetFr, fixture.targetFr);
  const again = await prepareFocusCard(session.id, 0, async () => { throw new Error("must not regenerate"); });
  assert.equal(again.items[0].variationId, ready.variationId);
  // Grading must look up the persisted variation answer, not the base lesson sentence.
  const graded = await grade(new NextRequest("http://localhost/api/ai/grade-item", { method: "POST",
    body: JSON.stringify({ itemId: item.id, variationId: ready.variationId, attempt: fixture.targetFr }) }));
  assert.equal(graded.status, 200);
  const gradeResult = await graded.json();
  assert.equal(gradeResult.verdict, "CORRECT");
  assert.equal(gradeResult.gradedBy, "local");
  assert.equal(gradeResult.corrected, fixture.targetFr);
  const fallback = await create();
  const failed = await prepareFocusCard(fallback.id, 0, async () => { throw new Error("provider unavailable"); });
  assert.equal(failed.items[0].variationUnavailable, true);
  assert.equal(failed.items[0].targetFr, cardFor(item).targetFr);
  let retried = false;
  await prepareFocusCard(fallback.id, 0, async () => { retried = true; return fixture; });
  assert.equal(retried, false, "resuming a fallback must not silently replace its answer");
  // Repeated generated contexts are rejected before they become a new card.
  const duplicate = await create();
  assert.equal((await prepareFocusCard(duplicate.id, 0, async () => fixture)).items[0].variationUnavailable, true);
  const face = cardFor(item);
  assert.equal(focusVariationSchema(item, []).safeParse({ prompt_en: face.promptEn, target_fr: face.targetFr, note: "" }).success, false);
  assert.equal(focusVariationSchema(item, [fixture]).safeParse({ prompt_en: fixture.promptEn.toUpperCase(), target_fr: fixture.targetFr, note: "" }).success, false);
  assert.equal(focusVariationSchema({ ...item, type: "correction", exampleFr: "Je ne m’y suis pas intéressé.", exampleEn: "I wasn't interested in it." }, []).safeParse({
    prompt_en: "At the time, I wasn't interested in it.", target_fr: "À l’époque, je ne m’y suis pas intéressé.", note: "",
  }).success, false, "prefix-only changes are not new grammar contexts");
  // Advancing while generation runs cannot replace the next card or resurrect the session.
  const racing = await create();
  await assert.rejects(prepareFocusCard(racing.id, 0, async () => {
    await db.update(focusSessions).set({ status: "abandoned" }).where(eq(focusSessions.id, racing.id));
    return { ...fixture, promptEn: "Tomorrow, I would like tea.", targetFr: "Demain, je voudrais du thé." };
  }), /changed while preparing/);
  const [raced] = await db.select().from(focusSessions).where(eq(focusSessions.id, racing.id));
  assert.equal(raced.plan[0].variationId, undefined);
  // Missing items retain their index and cannot accidentally show a different card's target.
  const missing = await serializeFocusSession({ ...session, plan: [{ itemId: 999999999, direction: "production", source: "due" }, ...session.plan] });
  assert.equal(missing.items.length, 2);
  assert.equal(missing.items[0].unavailable, true);
  assert.equal(missing.items[1].id, item.id);
  await db.update(focusSessions).set({ status: "abandoned" });
  const reviewsBefore = await db.select().from(itemReviews);
  const simultaneous = await Promise.all(Array.from({ length: 4 }, async () => (await GET()).json()));
  assert.equal(new Set(simultaneous.map(s => s.sessionId)).size, 1, "concurrent GETs create one durable session");
  if (simultaneous[0].sessionId) {
    await POST(new NextRequest("http://localhost/api/focus-session", { method: "POST", body: JSON.stringify({ sessionId: simultaneous[0].sessionId, currentIndex: 0, restart: true }) }));
    const [stopped] = await db.select().from(focusSessions).where(eq(focusSessions.id, simultaneous[0].sessionId));
    assert.equal(stopped.status, "abandoned");
  }
  assert.deepEqual(await db.select().from(itemReviews), reviewsBefore, "starting or restarting never fabricates ratings");
  await db.update(focusSessions).set({ status: "abandoned" });
  await db.insert(itemReviews).values(originalItems.filter(i => !i.suspended).map(i => ({ itemId: i.id, direction: "production", rating: 2, ratedAt: new Date(), verdict: "CORRECT" })));
  const caughtUp = await (await GET()).json();
  assert.equal(caughtUp.caughtUp, true);
  assert.deepEqual(caughtUp.items, []);
  assert.deepEqual(await db.select().from(learningItems), originalItems, "selection/generation leave learner scheduling and scores unchanged");
  console.log("Passed: cooldown exhaustion, concurrent session/card loads, durable variation targets, actual grading, fallback stability, duplicate rejection, generation/advance race and no learner-score writes.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
