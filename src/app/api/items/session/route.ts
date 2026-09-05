import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { learningItems } from "@/lib/db/schema";
import { jsonOk } from "@/lib/api";
import { cardFor } from "@/lib/items/card";
import { getWeeklyPracticeIds } from "@/lib/items/weekly-practice-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const requested = Number(req.nextUrl.searchParams.get("count") ?? 6);
  const count = Number.isInteger(requested) ? Math.max(1, Math.min(20, requested)) : 6;
  const [rows, weeklyIds] = await Promise.all([
    db.select().from(learningItems).where(eq(learningItems.suspended, false)),
    getWeeklyPracticeIds(),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const weekly = new Set(weeklyIds);
  const dueIds = rows.filter((r) => r.dueAt.getTime() <= Date.now())
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || b.priority - a.priority)
    .map((r) => r.id);
  const ids = [...new Set([...weeklyIds, ...dueIds])].filter((id) => byId.has(id)).slice(0, count);
  return jsonOk({ items: ids.map((id) => {
    const row = byId.get(id)!;
    return { id, ...cardFor(row), weekly: weekly.has(id) };
  }) });
}
