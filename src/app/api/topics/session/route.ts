import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { actOnTopicSession, readTopicSession, startTopicSession, TopicConflict, TopicNotFound } from "@/lib/curriculum/service";
import { AllProvidersFailed } from "@/lib/ai/providers";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 360;
const Start = z.object({ action: z.literal("start"), topicId: z.string().min(1).max(80), mode: z.enum(["learn", "revisit", "mixed", "oral", "theory"]).default("learn") });
const Action = z.object({ action: z.enum(["confirm", "answer", "reveal", "hint", "next", "leave"]), sessionId: z.string().uuid(), questionId: z.string().uuid().optional(), answer: z.string().max(800).optional(), spoken: z.boolean().optional(), elapsedMs: z.number().int().min(0).max(3_600_000).optional(), teachBack: z.string().max(1000).optional() });

function failure(error: unknown) {
  if (error instanceof TopicConflict) return jsonError(error.message, 409);
  if (error instanceof TopicNotFound) return jsonError(error.message, 404);
  if (error instanceof AllProvidersFailed) return jsonError("AI is temporarily unavailable. Your session is saved; try again or check AI providers in Settings.", 502);
  if (error instanceof z.ZodError) return jsonError("Invalid session request.", 400);
  console.error("Topic session:", error);
  return jsonError(error instanceof Error ? error.message : "Could not update the session.", 400);
}
export async function GET(req: NextRequest) {
  try { return jsonOk(await readTopicSession(z.string().uuid().parse(req.nextUrl.searchParams.get("id")))); }
  catch (error) { return failure(error); }
}
export async function POST(req: NextRequest) {
  if (!rateLimit("topics", 90, 60_000).allowed) return jsonError("Please wait a moment before trying again.", 429);
  try {
    const body = z.union([Start, Action]).parse(await req.json());
    return jsonOk(body.action === "start" ? await startTopicSession(body.topicId, body.mode) : await actOnTopicSession(body));
  } catch (error) { return failure(error); }
}
