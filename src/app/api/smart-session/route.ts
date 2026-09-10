import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { getSmartSession, smartAction, SmartActionSchema, SmartConflict } from "@/lib/smart/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET() {
  try { return jsonOk({ session: await getSmartSession() }); }
  catch { return jsonError("Couldn't load Smart session. Try again.", 500); }
}

export async function POST(req: NextRequest) {
  const parsed = SmartActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid session request.", 400);
  try { return jsonOk({ session: await smartAction(parsed.data) }); }
  catch (error) {
    if (error instanceof SmartConflict) return jsonError(error.message, 409);
    console.error("[smart-session] Could not save session", error instanceof Error ? error.name : "unknown error");
    return jsonError("Couldn't save your progress. Your answer is still here; please retry.", 500);
  }
}
