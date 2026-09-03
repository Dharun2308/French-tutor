import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { errorPatterns, itemReviews, learningItems } from "@/lib/db/schema";
import { jsonOk } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

export async function GET() {
  const cutoff = new Date(Date.now() - 30 * DAY_MS);
  const [reviews, projections] = await Promise.all([
    db
      .select({ review: itemReviews, item: learningItems })
      .from(itemReviews)
      .innerJoin(learningItems, eq(learningItems.id, itemReviews.itemId))
      .where(and(eq(itemReviews.direction, "production"), gte(itemReviews.ratedAt, cutoff)))
      .orderBy(desc(itemReviews.ratedAt)),
    db.select().from(errorPatterns),
  ]);
  const totals = new Map(projections.map((pattern) => [pattern.patternKey, pattern.totalCount]));
  const grouped = new Map<
    string,
    {
      key: string;
      errorType: string;
      grammarTopic: string;
      count: number;
      lastSeenAt: Date;
      examples: Array<{
        itemId: number;
        french: string;
        english: string;
        attempt: string | null;
        corrected: string | null;
        reason: string | null;
        at: Date;
      }>;
    }
  >();

  for (const { review, item } of reviews) {
    if (
      (review.verdict !== "MINOR_ERROR" && review.verdict !== "WRONG") ||
      !review.errorType ||
      review.errorType === "none" ||
      review.errorType === "typo"
    ) {
      continue;
    }
    const topic = item.grammarTopic.trim().toLocaleLowerCase();
    const key = `${review.errorType}:${topic || "general"}`;
    const group = grouped.get(key) ?? {
      key,
      errorType: review.errorType,
      grammarTopic: topic,
      count: 0,
      lastSeenAt: review.ratedAt,
      examples: [],
    };
    group.count += 1;
    if (review.ratedAt > group.lastSeenAt) group.lastSeenAt = review.ratedAt;
    if (group.examples.length < 3) {
      group.examples.push({
        itemId: item.id,
        french: item.french,
        english: item.english,
        attempt: review.userAnswer,
        corrected: review.correctedAnswer,
        reason: review.gradeReason,
        at: review.ratedAt,
      });
    }
    grouped.set(key, group);
  }

  const patterns = [...grouped.values()]
    .filter((pattern) => pattern.count >= (pattern.errorType === "accent" ? 3 : 2))
    .map((pattern) => ({ ...pattern, totalCount: totals.get(pattern.key) ?? pattern.count }))
    .sort((a, b) => b.count - a.count || b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
  return jsonOk({ days: 30, patterns });
}
