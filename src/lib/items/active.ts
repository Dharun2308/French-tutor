import { and, asc, desc, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { activeSelections, learningItems } from "@/lib/db/schema";
import { getSettings } from "@/lib/api";
import { rankWeakItems, type RankedWeakItem } from "@/lib/items/weak";
import { selectWeeklyItems } from "@/lib/items/active-selection";
import { startOfUserWeek } from "@/lib/timezone";

const ACTIVE_SIZE = 10;

export interface ActiveItem {
  selectionId: number;
  weekStart: Date;
  position: number;
  source: string;
  pinned: boolean;
  score: number;
  reasons: string[];
  id: number;
  french: string;
  english: string;
  exampleFr: string;
  exampleEn: string;
  type: string;
  grammarTopic: string;
  priority: number;
  sourceContext: string;
}

async function currentWeek(now: Date): Promise<Date> {
  const settings = await getSettings();
  return startOfUserWeek(now, settings.timezone ?? "UTC");
}

async function readSelection(weekStart: Date): Promise<ActiveItem[]> {
  const rows = await db
    .select({ selection: activeSelections, item: learningItems })
    .from(activeSelections)
    .innerJoin(learningItems, eq(learningItems.id, activeSelections.itemId))
    .where(eq(activeSelections.weekStart, weekStart))
    .orderBy(asc(activeSelections.position));
  return rows.map(({ selection, item }) => ({
    selectionId: selection.id,
    weekStart: selection.weekStart,
    position: selection.position,
    source: selection.source,
    pinned: selection.pinned,
    score: selection.scoreSnapshot,
    reasons: selection.reasons ?? [],
    id: item.id,
    french: item.french,
    english: item.english,
    exampleFr: item.exampleFr,
    exampleEn: item.exampleEn,
    type: item.type,
    grammarTopic: item.grammarTopic,
    priority: item.priority,
    sourceContext: item.sourceContext,
  }));
}

/** Read or lazily create this week's deterministic Active 10. */
export async function getActiveItems(now: Date = new Date()): Promise<{
  weekStart: Date;
  items: ActiveItem[];
}> {
  const weekStart = await currentWeek(now);
  let existing = await readSelection(weekStart);
  if (existing.length > 0) return { weekStart, items: existing };

  const ranking = await rankWeakItems(now);
  const [previousWeek] = await db
    .select({ weekStart: activeSelections.weekStart })
    .from(activeSelections)
    .where(lt(activeSelections.weekStart, weekStart))
    .orderBy(desc(activeSelections.weekStart))
    .limit(1);

  let priorPinnedIds: number[] = [];
  if (previousWeek) {
    const priorPins = await db
      .select({ itemId: activeSelections.itemId })
      .from(activeSelections)
      .where(
        and(
          eq(activeSelections.weekStart, previousWeek.weekStart),
          eq(activeSelections.pinned, true)
        )
      )
      .orderBy(asc(activeSelections.position));
    priorPinnedIds = priorPins.map((row) => row.itemId);
  }

  const chosen = selectWeeklyItems(ranking, priorPinnedIds, ACTIVE_SIZE);

  if (chosen.length > 0) {
    await db
      .insert(activeSelections)
      .values(
        chosen.map(({ item, pinned: isPinned, source }, index) => ({
          itemId: item.id,
          weekStart,
          position: index + 1,
          source,
          pinned: isPinned,
          scoreSnapshot: item.score,
          reasons: item.reasons,
          selectedAt: now,
        }))
      )
      .onConflictDoNothing();
  }

  existing = await readSelection(weekStart);
  return { weekStart, items: existing };
}

export type ActiveAction = "pin" | "unpin" | "replace";

export async function changeActiveItem(
  action: ActiveAction,
  itemId: number,
  now: Date = new Date()
): Promise<{ weekStart: Date; items: ActiveItem[] }> {
  const current = await getActiveItems(now);
  const ranking = await rankWeakItems(now);
  const ranked = ranking.find((item) => item.id === itemId);
  const selected = current.items.find((item) => item.id === itemId);

  if (action === "unpin") {
    if (!selected) throw new Error("Item is not in this week's Active 10.");
    await db
      .update(activeSelections)
      .set({ pinned: false })
      .where(eq(activeSelections.id, selected.selectionId));
    return getActiveItems(now);
  }

  if (action === "pin") {
    if (!ranked) throw new Error("Item is not eligible for Active 10.");
    const pinnedCount = current.items.filter((item) => item.pinned).length;
    if (!selected && pinnedCount >= ACTIVE_SIZE) {
      throw new Error("Unpin an item before pinning another one.");
    }
    if (selected) {
      await db
        .update(activeSelections)
        .set({ pinned: true, source: "pinned" })
        .where(eq(activeSelections.id, selected.selectionId));
      return getActiveItems(now);
    }

    if (current.items.length < ACTIVE_SIZE) {
      const position = Math.max(0, ...current.items.map((item) => item.position)) + 1;
      await db.insert(activeSelections).values({
        itemId,
        weekStart: current.weekStart,
        position,
        source: "pinned",
        pinned: true,
        scoreSnapshot: ranked.score,
        reasons: ranked.reasons,
        selectedAt: now,
      });
    } else {
      const replace = current.items
        .filter((item) => !item.pinned)
        .sort((a, b) => a.score - b.score || b.position - a.position)[0];
      if (!replace) throw new Error("Unpin an item before pinning another one.");
      await db
        .update(activeSelections)
        .set({
          itemId,
          source: "pinned",
          pinned: true,
          scoreSnapshot: ranked.score,
          reasons: ranked.reasons,
          selectedAt: now,
        })
        .where(eq(activeSelections.id, replace.selectionId));
    }
    return getActiveItems(now);
  }

  if (!selected) throw new Error("Item is not in this week's Active 10.");
  if (selected.pinned) throw new Error("Unpin this item before replacing it.");
  const selectedIds = new Set(current.items.map((item) => item.id));
  const replacement = ranking.find((item) => !selectedIds.has(item.id));
  if (!replacement) throw new Error("There are no other eligible items to add.");
  await db
    .update(activeSelections)
    .set({
      itemId: replacement.id,
      source: "replacement",
      pinned: false,
      scoreSnapshot: replacement.score,
      reasons: replacement.reasons,
      selectedAt: now,
    })
    .where(eq(activeSelections.id, selected.selectionId));
  return getActiveItems(now);
}
