import { inArray, max } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { itemReviews } from "@/lib/db/schema";
import { getActiveItems } from "@/lib/items/active";
import { orderWeeklyPractice } from "@/lib/items/weekly-practice";

export async function getWeeklyPracticeIds(now = new Date()): Promise<number[]> {
  const active = await getActiveItems(now);
  const ids = active.items.map((item) => item.id);
  if (!ids.length) return [];
  const reviews = await db.select({ itemId: itemReviews.itemId, last: max(itemReviews.ratedAt) })
    .from(itemReviews).where(inArray(itemReviews.itemId, ids)).groupBy(itemReviews.itemId);
  return orderWeeklyPractice(ids, new Map(reviews.map((r) => [r.itemId, r.last?.getTime() ?? 0])));
}
