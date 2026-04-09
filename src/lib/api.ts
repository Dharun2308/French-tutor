// Shared helpers for route handlers: settings access, JSON responses, etc.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { settings } from "@/lib/db/schema";

/** Return the singleton settings row. Create it with defaults if missing. */
export async function getSettings() {
  const rows = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  if (rows.length > 0) return rows[0];

  await db.insert(settings).values({
    id: 1,
    dailyTarget: 20,
    activeTenses: ["present"],
    activeLevels: ["A1"],
    preferredRegister: "all",
    ttsMode: "browser",
    ttsVoice: "alloy",
    timezone: "UTC",
  });
  const fresh = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  return fresh[0];
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function jsonOk<T>(data: T) {
  return NextResponse.json(data);
}
