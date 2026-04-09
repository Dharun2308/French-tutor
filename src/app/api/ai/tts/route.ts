// POST /api/ai/tts
// { text: string, voice?: string }
// Returns audio/mpeg. Aggressive cache headers — same text will 304 from the
// browser cache on repeat calls.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOpenAI } from "@/lib/openai";
import { jsonError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const Body = z.object({
  text: z.string().min(1).max(600),
  voice: z
    .enum([
      "alloy",
      "ash",
      "ballad",
      "coral",
      "echo",
      "fable",
      "onyx",
      "nova",
      "sage",
      "shimmer",
    ])
    .optional(),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit("ai_tts", 200, 60_000);
  if (!rl.allowed) return jsonError("Too many TTS requests", 429);

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return jsonError(
      `Invalid body: ${err instanceof Error ? err.message : String(err)}`,
      400
    );
  }

  const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
  const voice = body.voice ?? "alloy";

  try {
    const client = getOpenAI();
    const response = await client.audio.speech.create({
      model,
      voice,
      input: body.text,
      response_format: "mp3",
    });
    const arrayBuf = await response.arrayBuffer();
    return new NextResponse(Buffer.from(arrayBuf), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(arrayBuf.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("TTS error:", err);
    return jsonError("TTS unavailable", 502);
  }
}
