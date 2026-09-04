import { createHash } from "node:crypto";
import { eq, gte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { itemReviews, learningItems, tutorUsageEvents, weeklySummaries } from "@/lib/db/schema";
import { getSettings, jsonError, jsonOk } from "@/lib/api";
import { startOfUserWeek } from "@/lib/timezone";
import { getEnabledProviders, runStructured } from "@/lib/ai/providers";
import { rateLimit } from "@/lib/rate-limit";

const Summary = z.object({ headline: z.string().max(120), reflection: z.string().max(500), nextFocus: z.string().max(300) });
const schema = { type: "object", additionalProperties: false, required: ["headline", "reflection", "nextFocus"], properties: { headline: { type: "string", maxLength: 120 }, reflection: { type: "string", maxLength: 500 }, nextFocus: { type: "string", maxLength: 300 } } };

async function facts() {
  const settings = await getSettings();
  const weekStart = startOfUserWeek(new Date(), settings.timezone ?? "UTC");
  const [reviews, added, usage] = await Promise.all([
    db.select().from(itemReviews).where(gte(itemReviews.ratedAt, weekStart)),
    db.select({ id: learningItems.id }).from(learningItems).where(gte(learningItems.createdAt, weekStart)),
    db.select().from(tutorUsageEvents).where(gte(tutorUsageEvents.occurredAt, weekStart)),
  ]);
  const byDirection = (direction: string) => { const rows = reviews.filter((x) => x.direction === direction); const correct = rows.filter((x) => x.rating >= 2).length; return { attempts: rows.length, correct, percent: rows.length ? Math.round(correct / rows.length * 100) : null }; };
  return { weekStart, added: added.length, totalAttempts: reviews.length, production: byDirection("production"), listening: byDirection("listening"), hardOrAgain: reviews.filter((x) => x.rating <= 1).length, naturalTutorUses: usage.filter((x) => x.outcome === "natural").length };
}

export async function GET() {
  const data = await facts();
  const hash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
  const [cached] = await db.select().from(weeklySummaries).where(eq(weeklySummaries.weekStart, data.weekStart)).limit(1);
  return jsonOk({ facts: data, summary: cached?.summary ?? null, summaryStale: Boolean(cached && cached.factsHash !== hash) });
}

export async function POST() {
  if (!rateLimit("weekly_summary", 4, 60_000).allowed) return jsonError("Too many summary requests", 429);
  const data = await facts();
  const hash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
  try {
    const r = await runStructured({ purpose: "summary", system: "Write a concise, calm weekly reflection for an A2 French learner. Use only the supplied facts. Do not invent progress, scores, or praise. When evidence is sparse, say so plainly. Keep the headline under 120 characters, reflection under 500, and next focus under 300. Return JSON only.", user: `Weekly facts: ${JSON.stringify(data)}\nGive one headline, a 1–3 sentence reflection, and one concrete next focus.`, schemaName: "weekly_summary", jsonSchema: schema }, Summary, await getEnabledProviders());
    await db.insert(weeklySummaries).values({ weekStart: data.weekStart, factsHash: hash, summary: r.data, provider: r.provider, model: r.model }).onConflictDoUpdate({ target: weeklySummaries.weekStart, set: { generatedAt: new Date(), factsHash: hash, summary: r.data, provider: r.provider, model: r.model } });
    return jsonOk({ facts: data, summary: r.data, provider: r.provider });
  } catch (e) { return jsonError(e instanceof Error ? e.message : String(e), 502); }
}
