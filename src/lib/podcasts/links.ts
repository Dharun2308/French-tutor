// Pasted link → the show's public RSS feed (and the episode in it). Spotify's
// public embed page names the show and episode; Apple's podcast directory maps a
// show name or id to its feed. No accounts or keys.

import { feedLanguage, matchEpisode, parseLink, titleSimilarity, type Episode, type EpisodeHint, type Language } from "./model";
import { allShows, fetchFeed, fetchPublic, readText } from "./server";

export interface LinkPreview {
  show: { title: string; feed: string; image: string | null; language: Language; languageKnown: boolean; existingId: string | null; episodes: number };
  episode: Pick<Episode, "id" | "title" | "published" | "duration"> | null;
  /** The link named an episode that isn't in the public feed. */
  episodeMissing: string | null;
}

export class LinkError extends Error {}

const SHORT_HOSTS = /(^|\.)(spotify\.link|spoti\.fi|app\.link)$/;
const SPOTIFY_ONLY = "This show isn't in the public podcast directory, so it's probably Spotify-only. Its audio can't be downloaded.";

interface SpotifyEntity { name?: string; title?: string; subtitle?: string; releaseDate?: { isoString?: string }; duration?: number }

async function spotifyEntity(type: "episode" | "show", id: string): Promise<SpotifyEntity> {
  const response = await fetchPublic(`https://open.spotify.com/embed/${type}/${id}`, { timeoutMs: 15_000, accept: "text/html" });
  if (response.status === 404) throw new LinkError("Spotify doesn't know this link. Check it and paste it again.");
  if (!response.ok) throw new LinkError(`Spotify returned ${response.status}. Try again in a minute.`);
  const html = await readText(response, 3 * 1024 * 1024);
  const json = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
  const entity = json ? (JSON.parse(json)?.props?.pageProps?.state?.data?.entity as SpotifyEntity | undefined) : undefined;
  if (!entity?.subtitle) throw new LinkError("Couldn't read this Spotify link.");
  return entity;
}

/** spotify.link short links redirect to open.spotify.com. */
async function expandShortLink(url: string): Promise<string> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { "user-agent": "Mozilla/5.0" } });
    const location = response.headers.get("location");
    if (!location) break;
    current = new URL(location, current).href;
    if (new URL(current).hostname === "open.spotify.com") return current;
    if (!SHORT_HOSTS.test(new URL(current).hostname)) break;
  }
  if (!SHORT_HOSTS.test(new URL(current).hostname)) throw new LinkError("Couldn't open this Spotify short link. Copy the full link instead.");
  // Branch short links answer with a page that holds the target.
  const html = await (await fetch(current, { signal: AbortSignal.timeout(10_000), headers: { "user-agent": "Mozilla/5.0" } })).text().catch(() => "");
  const target = /https:\/\/open\.spotify\.com\/(?:episode|show)\/[A-Za-z0-9]+/.exec(html)?.[0];
  if (!target) throw new LinkError("Couldn't open this Spotify short link. Copy the full link instead.");
  return target;
}

interface AppleShow { collectionId: number; collectionName: string; artistName?: string; feedUrl?: string }

async function apple<T>(params: Record<string, string>, path: "search" | "lookup"): Promise<T[]> {
  const response = await fetchPublic(`https://itunes.apple.com/${path}?${new URLSearchParams(params)}`, { timeoutMs: 15_000 });
  if (!response.ok) throw new LinkError("The podcast directory isn't answering. Try again in a minute.");
  return (JSON.parse(await readText(response, 5 * 1024 * 1024)).results ?? []) as T[];
}

/** The directory show with this name (Spotify shows the same name). */
async function findFeedByName(name: string): Promise<string> {
  const results = await apple<AppleShow>({ media: "podcast", entity: "podcast", term: name, limit: "15" }, "search");
  const best = results
    .filter((show) => show.feedUrl)
    .map((show) => ({ show, score: titleSimilarity(name, show.collectionName) }))
    .sort((a, b) => b.score - a.score)[0];
  if (!best || best.score < 0.85) throw new LinkError(SPOTIFY_ONLY);
  return best.show.feedUrl!;
}

export async function resolveLink(input: string): Promise<LinkPreview> {
  let link = parseLink(input);
  if (!link) throw new LinkError("Paste a Spotify, Apple Podcasts or RSS feed link.");
  if (link.kind === "spotify-short") link = parseLink(await expandShortLink(link.url));
  if (!link || link.kind === "spotify-short") throw new LinkError("Couldn't read this Spotify link.");

  let feedUrl: string;
  let hint: EpisodeHint | null = null;
  if (link.kind === "spotify") {
    const entity = await spotifyEntity(link.type, link.id);
    feedUrl = await findFeedByName(entity.subtitle!);
    if (link.type === "episode") {
      hint = { title: entity.name || entity.title || "", published: entity.releaseDate?.isoString ?? null, duration: entity.duration ? entity.duration / 1000 : null };
    }
  } else if (link.kind === "apple") {
    const [show] = await apple<AppleShow>({ id: link.showId, entity: "podcast" }, "lookup");
    if (!show?.feedUrl) throw new LinkError("This Apple Podcasts show has no public feed.");
    feedUrl = show.feedUrl;
    if (link.episodeId) {
      const episodes = await apple<{ trackId: number; trackName?: string; releaseDate?: string; trackTimeMillis?: number }>(
        { id: link.showId, entity: "podcastEpisode", limit: "300" }, "lookup");
      const episode = episodes.find((e) => String(e.trackId) === link.episodeId);
      if (episode?.trackName) {
        hint = { title: episode.trackName, published: episode.releaseDate ?? null, duration: episode.trackTimeMillis ? episode.trackTimeMillis / 1000 : null };
      }
    }
  } else {
    feedUrl = link.url.replace(/^http:/, "https:");
  }

  const feed = await fetchFeed(feedUrl).catch((error) => {
    throw new LinkError(link.kind === "feed" ? "That address isn't a podcast feed I can read." : `Found the show, but its feed didn't load (${error instanceof Error ? error.message : error}).`);
  });
  const existing = (await allShows()).find((show) => show.feed === feedUrl) ?? null;
  const language = feedLanguage(feed.language);
  const episode = hint ? matchEpisode(feed.episodes, hint) : null;
  return {
    show: {
      title: feed.title,
      feed: feedUrl,
      image: feed.image,
      language: existing?.language ?? language ?? "en",
      languageKnown: Boolean(existing || language),
      existingId: existing?.id ?? null,
      episodes: feed.episodes.length,
    },
    episode: episode && { id: episode.id, title: episode.title, published: episode.published, duration: episode.duration },
    episodeMissing: hint && !episode ? hint.title : null,
  };
}
