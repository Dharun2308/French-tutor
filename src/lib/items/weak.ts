import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { itemReviews, learningItems, tutorUsageEvents } from "@/lib/db/schema";
import { weakScore, type WeakScore } from "@/lib/items/weak-score";
import type { TutorUsageOutcome } from "@/types";

const DAY_MS = 86_400_000;

export interface RankedWeakItem extends WeakScore {
  id: number;
  french: string;
  english: string;
  exampleFr: string;
  exampleEn: string;
  type: string;
  grammarTopic: string;
  priority: number;
  sourceContext: string;
  encounterCount: number;
  createdAt: Date;
  dueAt: Date;
  reps: number;
  lapses: number;
}

/** Rank every unsuspended personal lesson item using recent review/usage evidence. */
export async function rankWeakItems(now: Date = new Date()): Promise<RankedWeakItem[]> {
  const reviewCutoff = new Date(now.getTime() - 180 * DAY_MS);
  const usageCutoff = new Date(now.getTime() - 365 * DAY_MS);
  const [items, reviews, usage] = await Promise.all([
    db.select().from(learningItems).where(eq(learningItems.suspended, false)),
    db
      .select({ itemId: itemReviews.itemId, rating: itemReviews.rating, ratedAt: itemReviews.ratedAt })
      .from(itemReviews)
      .where(and(eq(itemReviews.direction, "production"), gte(itemReviews.ratedAt, reviewCutoff)))
      .orderBy(desc(itemReviews.ratedAt))
      .limit(10_000),
    db
      .select({
        itemId: tutorUsageEvents.itemId,
        outcome: tutorUsageEvents.outcome,
        occurredAt: tutorUsageEvents.occurredAt,
      })
      .from(tutorUsageEvents)
      .where(gte(tutorUsageEvents.occurredAt, usageCutoff))
      .orderBy(desc(tutorUsageEvents.occurredAt))
      .limit(10_000),
  ]);

  const reviewsByItem = new Map<number, Array<{ rating: number; ratedAt: Date }>>();
  for (const review of reviews) {
    const bucket = reviewsByItem.get(review.itemId) ?? [];
    if (bucket.length < 10) bucket.push({ rating: review.rating, ratedAt: review.ratedAt });
    reviewsByItem.set(review.itemId, bucket);
  }
  const usageByItem = new Map<
    number,
    Array<{ outcome: TutorUsageOutcome; occurredAt: Date }>
  >();
  for (const event of usage) {
    const bucket = usageByItem.get(event.itemId) ?? [];
    bucket.push({ outcome: event.outcome as TutorUsageOutcome, occurredAt: event.occurredAt });
    usageByItem.set(event.itemId, bucket);
  }

  return items
    .map((item) => ({
      id: item.id,
      french: item.french,
      english: item.english,
      exampleFr: item.exampleFr,
      exampleEn: item.exampleEn,
      type: item.type,
      grammarTopic: item.grammarTopic,
      priority: item.priority,
      sourceContext: item.sourceContext,
      encounterCount: item.encounterCount,
      createdAt: item.createdAt,
      dueAt: item.dueAt,
      reps: item.reps,
      lapses: item.lapses,
      ...weakScore(
        item,
        reviewsByItem.get(item.id) ?? [],
        usageByItem.get(item.id) ?? [],
        now
      ),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (a.type === "correction" && b.type === "correction")
        return b.createdAt.getTime() - a.createdAt.getTime();
      if (a.type === "correction") return -1;
      if (b.type === "correction") return 1;
      return a.id - b.id;
    });
}
