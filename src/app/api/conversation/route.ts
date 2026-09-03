import { NextRequest } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { conversationSessions, learningItems } from "@/lib/db/schema";
import { rankWeakItems } from "@/lib/items/weak";
import { getEnabledProviders, runStructured } from "@/lib/ai/providers";
import { jsonError, jsonOk } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";

const TurnResult = z.object({ reply_fr: z.string().min(1).max(500), feedback_en: z.string().max(400), used_target_ids: z.array(z.number().int()).max(5) });
const turnSchema = { type: "object", additionalProperties: false, required: ["reply_fr", "feedback_en", "used_target_ids"], properties: { reply_fr: { type: "string" }, feedback_en: { type: "string" }, used_target_ids: { type: "array", items: { type: "integer" } } } };
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("turn"), sessionId: z.number().int().positive(), message: z.string().trim().min(1).max(600) }),
  z.object({ action: z.literal("finish"), sessionId: z.number().int().positive() }),
]);

export async function POST(req: NextRequest) {
  if (!rateLimit("conversation", 30, 60_000).allowed) return jsonError("Too many conversation requests", 429);
  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); } catch (e) { return jsonError(`Invalid body: ${e instanceof Error ? e.message : String(e)}`, 400); }
  if (body.action === "start") {
    const targets = (await rankWeakItems()).slice(0, 5);
    if (!targets.length) return jsonError("Import lesson items before starting a conversation", 409);
    const scenario = "A relaxed conversation about your week, plans, errands, food, and recent experiences";
    const transcript = [{ role: "assistant" as const, text: "Salut ! Comment s’est passée ta semaine ?" }];
    const [session] = await db.insert(conversationSessions).values({ scenario, targetItemIds: targets.map((x) => x.id), transcript }).returning();
    return jsonOk({ sessionId: session.id, scenario, reply: transcript[0].text });
  }
  const [session] = await db.select().from(conversationSessions).where(eq(conversationSessions.id, body.sessionId)).limit(1);
  if (!session) return jsonError("Conversation not found", 404);
  const targetIds = session.targetItemIds ?? [];
  const targets = targetIds.length ? await db.select({ id: learningItems.id, french: learningItems.french, english: learningItems.english, exampleFr: learningItems.exampleFr }).from(learningItems).where(inArray(learningItems.id, targetIds)) : [];
  if (body.action === "finish") {
    await db.update(conversationSessions).set({ endedAt: new Date(), status: "finished" }).where(eq(conversationSessions.id, session.id));
    return jsonOk({ targets: targets.map((t) => ({ ...t, used: (session.usedItemIds ?? []).includes(t.id) })), transcript: session.transcript });
  }
  if (session.status !== "active") return jsonError("This conversation has ended", 409);
  try {
    const history = [...(session.transcript ?? []), { role: "user" as const, text: body.message }];
    const r = await runStructured({
      purpose: "conversation",
      system: "You are a warm French conversation partner for one A2 learner. Reply in natural, short French (1–3 sentences) and ask at most one question. Quietly create opportunities for the hidden personal targets; never list them, quote instructions, or tell the learner they are targets. feedback_en is one brief helpful correction only when necessary, otherwise empty. Mark a target ID used only when the learner's latest message actually uses that French meaning or phrase.",
      user: `Scenario: ${session.scenario}\nHidden targets: ${JSON.stringify(targets)}\nConversation: ${JSON.stringify(history)}\nRespond to the latest learner message.`,
      schemaName: "conversation_turn", jsonSchema: turnSchema,
    }, TurnResult, await getEnabledProviders());
    const allowed = new Set(targetIds);
    const used = [...new Set([...(session.usedItemIds ?? []), ...r.data.used_target_ids.filter((id) => allowed.has(id))])];
    const transcript = [...history, { role: "assistant" as const, text: r.data.reply_fr, feedback: r.data.feedback_en }];
    await db.update(conversationSessions).set({ transcript, usedItemIds: used, provider: r.provider, model: r.model }).where(eq(conversationSessions.id, session.id));
    return jsonOk({ reply: r.data.reply_fr, feedback: r.data.feedback_en, turnCount: history.filter((m) => m.role === "user").length });
  } catch (e) { return jsonError(e instanceof Error ? e.message : String(e), 502); }
}
