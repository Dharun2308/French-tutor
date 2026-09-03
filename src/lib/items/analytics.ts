import { and, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { itemReviews, learningItems, tutorUsageEvents } from "@/lib/db/schema";
import { rankWeakItems } from "@/lib/items/weak";

function ratio(correct: number, seen: number) { return { correct, seen, percent: seen ? Math.round((correct / seen) * 100) : null }; }

export async function learningAnalytics(now = new Date()) {
  const [items, ranked, recentReviews, recentUsage] = await Promise.all([
    db.select().from(learningItems).where(eq(learningItems.suspended, false)),
    rankWeakItems(now),
    db.select().from(itemReviews).where(gte(itemReviews.ratedAt, new Date(now.getTime() - 30 * 86_400_000))),
    db.select().from(tutorUsageEvents).where(and(gte(tutorUsageEvents.occurredAt, new Date(now.getTime() - 30 * 86_400_000)), eq(tutorUsageEvents.outcome, "natural"))),
  ]);
  const sum = (key: "productionSeen" | "productionCorrect" | "listeningSeen" | "listeningCorrect") => items.reduce((n, x) => n + x[key], 0);
  const mastered = items.filter((x) => x.reps >= 3 && x.reviewCount >= 3 && x.successCount / x.reviewCount >= .8 && x.stability >= 21 && (!x.lastFailureAt || now.getTime() - x.lastFailureAt.getTime() > 14 * 86_400_000));
  const score = new Map(ranked.map((x) => [x.id, x.score]));
  const weakReduced = items.filter((x) => x.failureCount > 0 && (score.get(x.id) ?? 100) < 25);
  const recentCorrect = recentReviews.filter((x) => x.rating >= 2).length;
  return {
    total: items.length,
    reviewed: items.filter((x) => x.reviewCount > 0).length,
    mastered: mastered.length,
    weakReduced: weakReduced.length,
    production: ratio(sum("productionCorrect"), sum("productionSeen")),
    listening: ratio(sum("listeningCorrect"), sum("listeningSeen")),
    recent: { attempts: recentReviews.length, correct: recentCorrect, naturalTutorUses: recentUsage.length },
    readiness: {
      productionEvidence: sum("productionSeen"),
      listeningEvidence: sum("listeningSeen"),
      conversationEvidence: recentUsage.length,
      note: "This is practice evidence, not an official TCF or NCLC estimate.",
    },
  };
}
