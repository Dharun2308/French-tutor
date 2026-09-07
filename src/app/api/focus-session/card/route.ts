import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { prepareFocusCard } from "@/lib/items/focus-session";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (!rateLimit("focus_card", 30, 60_000).allowed) return jsonError("Please wait a moment before preparing another card.", 429);
  let body;
  try { body = z.object({ sessionId: z.number().int().positive(), index: z.number().int().min(0).max(11) }).parse(await request.json()); }
  catch { return jsonError("Invalid focus card.", 400); }
  try { return jsonOk(await prepareFocusCard(body.sessionId, body.index)); }
  catch { return jsonError("Could not load this focus card. Reload the session and try again.", 409); }
}
