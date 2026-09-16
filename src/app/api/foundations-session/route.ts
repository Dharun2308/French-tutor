import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { FoundationsActionSchema, FoundationsConflict, foundationsAction, getFoundationsSession } from "@/lib/foundations/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;

export async function GET() {
  try { return jsonOk({ session: await getFoundationsSession() }); }
  catch { return jsonError("Couldn't load Foundations. Please retry.", 500); }
}

export async function POST(req: NextRequest) {
  const parsed = FoundationsActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid Foundations request.", 400);
  try { return jsonOk({ session: await foundationsAction(parsed.data) }); }
  catch (error) {
    if (error instanceof FoundationsConflict) return jsonError(error.message, 409);
    console.error("[foundations] Could not save", error instanceof Error ? error.name : "unknown error");
    return jsonError("Couldn't save your progress. Your answer is still here; please retry.", 500);
  }
}
