import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { TOPIC_BY_ID } from "@/lib/curriculum/catalog";
import { generateTheory } from "@/lib/curriculum/ai";
import { readReferenceTheory } from "@/lib/curriculum/theory";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 360;

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!TOPIC_BY_ID.has(id)) return jsonError("Topic not found.", 404);
  if (!rateLimit("topic-theory", 30, 60_000).allowed) return jsonError("Please wait a moment before trying again.", 429);
  try { return jsonOk(await readReferenceTheory(id, generateTheory)); }
  catch (error) {
    console.error("Topic reference theory:", error);
    return jsonError("Could not load the theory. Please retry.", 502);
  }
}
