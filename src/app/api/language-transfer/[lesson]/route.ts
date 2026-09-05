import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { audioRange } from "@/lib/audio-range";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ lesson: string }> };

async function serve(request: Request, context: Context, head = false) {
  const { lesson } = await context.params;
  if (!/^(?:[1-9]|[1-3]\d|40)$/.test(lesson)) return new Response("Lesson not found", { status: 404 });
  const file = path.join(process.cwd(), "audio", "language-transfer-french", `${lesson.padStart(2, "0")}.mp3`);
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return new Response("Audio is not installed. Please try again later.", { status: 503 });
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
  const stream = createReadStream(file, { start, end });
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status: range ? 206 : 200, headers });
}
export const GET = (request: Request, context: Context) => serve(request, context);
export const HEAD = (request: Request, context: Context) => serve(request, context, true);
