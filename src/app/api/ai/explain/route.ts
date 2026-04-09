// POST /api/ai/explain
// { question: string }
// Returns a short explanation. No caching — explanations are contextual.

import { NextRequest } from "next/server";
import { z } from "zod";
import { chatJSON } from "@/lib/openai";
import {
  ExplanationSchema,
  ExplanationJsonSchema,
  explainSystemPrompt,
} from "@/lib/prompts";
import { jsonError, jsonOk } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const Body = z.object({
  question: z.string().min(1).max(400),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit("ai_explain", 30, 60_000);
  if (!rl.allowed) {
    return jsonError("Too many AI requests. Slow down a moment.", 429);
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return jsonError(
      `Invalid body: ${err instanceof Error ? err.message : String(err)}`,
      400
    );
  }

  try {
    const result = await chatJSON({
      system: explainSystemPrompt(),
      user: body.question,
      schema: ExplanationSchema,
      schemaName: "explanation",
      jsonSchema: ExplanationJsonSchema as Record<string, unknown>,
    });
    return jsonOk(result);
  } catch (err) {
    console.error("AI explain error:", err);
    return jsonError("AI unavailable. Try again in a moment.", 502);
  }
}
