import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { learningItems } from "@/lib/db/schema";
import { rankWeakItems } from "@/lib/items/weak";
import { cardFor } from "@/lib/items/card";
import { jsonOk } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const raw = Number(req.nextUrl.searchParams.get("count") ?? 10);
  const count = Number.isInteger(raw) ? Math.min(20, Math.max(1, raw)) : 10;
  const [ranked, rows] = await Promise.all([
    rankWeakItems(),
    db.select().from(learningItems).where(eq(learningItems.suspended, false)),
  ]);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const now = Date.now();
  const ordered = ranked
    .map((r) => byId.get(r.id)!)
    .filter(Boolean)
    .sort((a, b) => {
      const aDue = a.dueAt.getTime() <= now ? 1 : 0;
      const bDue = b.dueAt.getTime() <= now ? 1 : 0;
      return bDue - aDue || a.listeningSeen - b.listeningSeen || b.priority - a.priority;
    })
    .slice(0, count);
  return jsonOk({
    items: ordered.map((r) => ({ id: r.id, type: r.type, priority: r.priority, reps: r.reps, ...cardFor(r) })),
  });
}
