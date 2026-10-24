// GET /api/podcasts — shows and their episodes, with transcript status.

import { jsonError, jsonOk } from "@/lib/api";
import { SHOWS } from "@/lib/podcasts/model";
import { getFeed, listStatus, readPosition } from "@/lib/podcasts/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // One unreachable feed shouldn't hide the other shows.
    const loaded = await Promise.all(SHOWS.map(async (show) => {
      const feed = await getFeed(show).catch((error) => {
        console.error(`[podcasts] feed ${show.id}:`, error);
        return null;
      });
      if (!feed) return null;
      const episodes = await Promise.all(feed.episodes.map(async ({ id, title, published, duration }) => ({
        id, title, published, duration, status: await listStatus(show.id, id), position: await readPosition(show.id, id),
      })));
      return { id: show.id, title: feed.title || show.title, image: feed.image, episodes };
    }));
    const shows = loaded.filter((show) => show !== null);
    if (!shows.length) throw new Error("no feed loaded");
    return jsonOk({ shows });
  } catch (error) {
    console.error("[podcasts] feed:", error);
    return jsonError("Couldn't load the podcast feed. Try again later.", 502);
  }
}
