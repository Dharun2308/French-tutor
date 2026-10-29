// GET/HEAD /api/podcasts/:show/:episode/media — the exact file Whisper transcribed,
// so line timings match (feeds can insert different ads on every download).

import { stat } from "node:fs/promises";
import { audioRange } from "@/lib/audio-range";
import { fileByteStream } from "@/lib/file-byte-stream";
import { audioPath, findShow } from "@/lib/podcasts/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ show: string; episode: string }> };

async function serve(request: Request, context: Context, head = false) {
  const params = await context.params;
  const show = await findShow(params.show);
  if (!show || !/^[0-9a-z]{1,32}$/.test(params.episode)) return new Response("Episode not found", { status: 404 });
  const file = audioPath(show.id, params.episode);
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return new Response("Audio is still downloading.", { status: 503 });
  const range = audioRange(head ? null : request.headers.get("range"), info.size);
  const headers = new Headers({ "Content-Type": "audio/mpeg", "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=86400" });
  if (range === "invalid") {
    headers.set("Content-Range", `bytes */${info.size}`);
    return new Response(null, { status: 416, headers });
  }
  const start = range?.start ?? 0;
  const end = range?.end ?? info.size - 1;
  headers.set("Content-Length", String(end - start + 1));
  if (range) headers.set("Content-Range", `bytes ${start}-${end}/${info.size}`);
  if (head) return new Response(null, { headers });
  const stream = await fileByteStream(file, start, end);
  return new Response(stream, { status: range ? 206 : 200, headers });
}
export const GET = (request: Request, context: Context) => serve(request, context);
export const HEAD = (request: Request, context: Context) => serve(request, context, true);
