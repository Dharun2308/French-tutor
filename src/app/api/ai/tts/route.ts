// POST /api/ai/tts
// { text: string, voice?: string }
// Returns audio/mpeg. Aggressive cache headers — same text will 304 from the
// browser cache on repeat calls.

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getOpenAI } from "@/lib/openai";
import { getSettings, jsonError } from "@/lib/api";
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

  const settings = await getSettings();
  if (settings.ttsMode !== "openai") {
    return jsonError("OpenAI speech is disabled in Settings.", 409);
  }

  const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
  const voice = body.voice ?? "alloy";
  const cacheDir = path.join(process.cwd(), "tts-cache");
  const cacheKey = createHash("sha256")
    .update(JSON.stringify({ model, voice, text: body.text.trim() }))
    .digest("hex");
  const cachePath = path.join(cacheDir, `${cacheKey}.mp3`);

  try {
    const cached = await fs.readFile(cachePath).catch(() => null);
    if (cached) {
      return new NextResponse(cached, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": String(cached.byteLength),
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-TTS-Cache": "HIT",
        },
      });
    }
    const client = getOpenAI();
    const response = await client.audio.speech.create({
      model,
      voice,
      input: body.text,
      response_format: "mp3",
    });
    const arrayBuf = await response.arrayBuffer();
    const audio = Buffer.from(arrayBuf);
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(cachePath, audio);
    return new NextResponse(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(arrayBuf.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-TTS-Cache": "MISS",
      },
    });
  } catch (err) {
    console.error("TTS error:", err);
    return jsonError("TTS unavailable", 502);
  }
}
