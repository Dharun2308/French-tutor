// GET  /api/podcasts — shows and their episodes, with transcript status.
// POST /api/podcasts { action: "resolve", url } — what a pasted link points at
//                    { action: "add", feed, language } — save that show
//                    { action: "remove", id } — take an added show off the list

import { jsonError, jsonOk } from "@/lib/api";
import { z } from "zod";
import { LinkError, resolveLink } from "@/lib/podcasts/links";
import { addShow, allShows, fetchFeed, findShow, getFeed, listStatus, readPosition, removeShow } from "@/lib/podcasts/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // One unreachable feed shouldn't hide the other shows.
    const loaded = await Promise.all((await allShows()).map(async (show) => {
      const feed = await getFeed(show).catch((error) => {
        console.error(`[podcasts] feed ${show.id}:`, error);
        return null;
      });
      if (!feed) return null;
      const episodes = await Promise.all(feed.episodes.map(async ({ id, title, published, duration }) => ({
        id, title, published, duration, status: await listStatus(show.id, id), position: await readPosition(show.id, id),
      })));
      return { id: show.id, title: feed.title || show.title, image: feed.image, language: show.language, added: Boolean(show.added), episodes };
    }));
    const shows = loaded.filter((show) => show !== null);
    if (!shows.length) throw new Error("no feed loaded");
    return jsonOk({ shows });
  } catch (error) {
    console.error("[podcasts] feed:", error);
    return jsonError("Couldn't load the podcast feed. Try again later.", 502);
  }
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("resolve"), url: z.string().min(1).max(2000) }),
  z.object({ action: z.literal("add"), feed: z.string().url().max(2000), language: z.enum(["fr", "en"]) }),
  z.object({ action: z.literal("remove"), id: z.string().max(80) }),
]);

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid request", 400);
  const body = parsed.data;
  try {
    if (body.action === "resolve") return jsonOk(await resolveLink(body.url));
    if (body.action === "add") {
      // Re-read the feed so only a working podcast feed is saved.
      const feed = await fetchFeed(body.feed).catch(() => null);
      if (!feed) return jsonError("That feed didn't load. Try the link again.", 502);
      const show = await addShow({ title: feed.title, feed: body.feed, language: body.language });
      return jsonOk({ id: show.id });
    }
    const show = await findShow(body.id);
    if (!show?.added) return jsonError("Only shows you added can be removed.", 400);
    await removeShow(show.id);
    return jsonOk({ ok: true });
  } catch (error) {
    if (error instanceof LinkError) return jsonError(error.message, 422);
    console.error(`[podcasts] ${body.action}:`, error);
    return jsonError("Something went wrong looking up that link. Try again.", 502);
  }
}
