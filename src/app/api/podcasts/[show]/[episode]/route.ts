// GET  /api/podcasts/:show/:episode[?en=1] — status, French lines, English when asked.
// POST /api/podcasts/:show/:episode { action: "transcribe" } | { action: "translate", from }
//                                   | { action: "position", seconds, done } (listening position)

import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { episodeStatus, findEpisode, findShow, readEnglish, readLines, readPosition, startTranscription, startTranslation, writePosition } from "@/lib/podcasts/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ show: string; episode: string }> };

async function resolve(context: Context) {
  const params = await context.params;
  const show = findShow(params.show);
  if (!show || !/^[0-9a-z]{1,32}$/.test(params.episode)) return null;
  const episode = await findEpisode(show, params.episode).catch(() => undefined);
  return episode ? { show, episode } : null;
}

export async function GET(request: Request, context: Context) {
  const found = await resolve(context);
  if (!found) return jsonError("Episode not found", 404);
  const { show, episode } = found;
  const status = await episodeStatus(show.id, episode.id);
  const lines = status.stage === "ready" ? await readLines(show.id, episode.id) : null;
  const wantEnglish = new URL(request.url).searchParams.get("en") === "1";
  return jsonOk({
    show: { id: show.id, title: show.title },
    episode: { id: episode.id, title: episode.title, published: episode.published, duration: episode.duration },
    ...status,
    lines,
    en: lines && wantEnglish ? await readEnglish(show.id, episode.id) : null,
    position: await readPosition(show.id, episode.id),
  });
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("transcribe") }),
  z.object({ action: z.literal("translate"), from: z.number().int().min(0).default(0) }),
  z.object({ action: z.literal("position"), seconds: z.number().min(0).max(24 * 3600), done: z.boolean().default(false) }),
]);

export async function POST(request: Request, context: Context) {
  const found = await resolve(context);
  if (!found) return jsonError("Episode not found", 404);
  // sendBeacon posts text/plain, so read the body as text.
  const parsed = Body.safeParse(await request.text().then(JSON.parse).catch(() => null));
  if (!parsed.success) return jsonError("Invalid request", 400);
  const { show, episode } = found;
  if (parsed.data.action === "position") {
    await writePosition(show.id, episode.id, parsed.data.seconds, parsed.data.done);
    return jsonOk({ ok: true });
  }
  if (parsed.data.action === "transcribe") await startTranscription(show, episode);
  else await startTranslation(show, episode.id, parsed.data.from);
  return jsonOk(await episodeStatus(show.id, episode.id));
}
