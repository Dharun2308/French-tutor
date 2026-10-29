// Pure helpers for the Podcasts tab: RSS parsing, transcript lines and
// translation chunks. No I/O here so node --test can cover it.

export type Language = "fr" | "en";

export interface Show {
  id: string;
  title: string;
  feed: string;
  /** Spoken language. English shows get a French translation of every line. */
  language: Language;
  /** Added from a pasted link (stored in podcasts/shows.json) rather than built in. */
  added?: boolean;
}

/** Built-in shows; more are added from pasted links. */
export const SHOWS: Show[] = [
  { id: "little-talk-slow-french", title: "Little Talk in Slow French", feed: "https://www.spreaker.com/show/6084166/episodes/feed", language: "fr" },
  { id: "innerfrench", title: "InnerFrench", feed: "https://podcast.innerfrench.com/feed.xml", language: "fr" },
];

export interface Episode {
  id: string;
  title: string;
  published: string | null;
  duration: number | null;
  audioUrl: string;
  bytes: number | null;
}

export interface FeedInfo {
  title: string;
  image: string | null;
  /** The feed's <language>, e.g. "fr" or "en-us". */
  language?: string | null;
  episodes: Episode[];
}

export interface Line {
  start: number;
  end: number;
  /** French: what is said (French shows) or its translation (English shows; "" until translated). */
  fr: string;
  /** English shows: what is said. */
  source?: string;
  /** English show line whose French translation hasn't arrived yet. */
  pending?: boolean;
  /** Inserted English ad (feeds add these per download); hidden behind one "Ad" row. */
  ad?: boolean;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeXml(text: string): string {
  return text
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
      if (code[0] === "#") {
        const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
      }
      return ENTITIES[code.toLowerCase()] ?? whole;
    })
    .trim();
}

function tag(xml: string, name: string): string | null {
  const escaped = name.replace(":", "\\:");
  const match = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`, "i").exec(xml);
  return match ? decodeXml(match[1]) : null;
}

function attr(xml: string, name: string, attribute: string): string | null {
  const escaped = name.replace(":", "\\:");
  const element = new RegExp(`<${escaped}\\s[^>]*>`, "i").exec(xml)?.[0];
  if (!element) return null;
  const match = new RegExp(`\\s${attribute}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(element);
  return match ? decodeXml(match[2] ?? match[3] ?? "") : null;
}

/** "1943", "32:23" or "1:02:03" → seconds. */
export function parseDuration(value: string | null): number | null {
  if (!value) return null;
  const parts = value.trim().split(":").map(Number);
  if (!parts.length || parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  return parts.reduce((total, n) => total * 60 + n, 0);
}

/** Stable, URL-safe id: Spreaker's numeric episode id when present, else a hash of the guid. */
export function episodeId(guid: string): string {
  const spreaker = /spreaker\.com\/episode\/(\d+)/.exec(guid);
  if (spreaker) return spreaker[1];
  // cyrb53: a stable 53-bit string hash that also runs in the browser bundle.
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < guid.length; i++) {
    const c = guid.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

export function parseFeed(xml: string): FeedInfo {
  const channel = xml.split(/<item[\s>]/i)[0];
  const episodes: Episode[] = [];
  for (const match of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const item = match[0];
    const audioUrl = attr(item, "enclosure", "url");
    const type = attr(item, "enclosure", "type");
    if (!audioUrl || !/^https:\/\//i.test(audioUrl) || (type && !type.startsWith("audio/"))) continue;
    const guid = tag(item, "guid") || audioUrl;
    const published = tag(item, "pubDate");
    const date = published ? new Date(published) : null;
    const bytes = Number(attr(item, "enclosure", "length"));
    episodes.push({
      id: episodeId(guid),
      title: tag(item, "title") || "Untitled episode",
      published: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
      duration: parseDuration(tag(item, "itunes:duration")),
      audioUrl,
      bytes: Number.isSafeInteger(bytes) && bytes > 0 ? bytes : null,
    });
  }
  return {
    title: tag(channel, "title") || "Podcast",
    image: attr(channel, "itunes:image", "href"),
    language: tag(channel, "language"),
    episodes,
  };
}

const ENGLISH = new Set("the and you your is are to of for with have has i i'm i've it's that this on get just can we our my at be all right now they what more from or will was not do don't so like it in".split(" "));
const FRENCH = new Set("le la les de des du un une et est je tu il elle nous vous ils que qui pas ne en dans pour sur avec au aux ce c'est mais ou donc très se sa son ses mon ma mes y à l d j qu n s c par comme plus aussi ça oui non bien".split(" "));

function wordCounts(text: string) {
  let english = 0;
  let french = 0;
  for (const word of text.toLowerCase().match(/[a-zà-ÿ']+/g) ?? []) {
    if (ENGLISH.has(word)) english++;
    if (FRENCH.has(word) || FRENCH.has(word.split("'")[0])) french++;
  }
  return { english, french };
}

/**
 * Flag ad breaks: runs of English lines (no French function words) at least
 * three lines and eight seconds long. Up to two short lines with no French words
 * inside or at the edge of a run join it; the host's glosses and English
 * examples ("To bear or to stand.") stay.
 */
export function markAds(lines: Line[]): Line[] {
  const counts = lines.map((line) => wordCounts(line.fr));
  const english = counts.map((c) => c.english >= 2 && c.french === 0);
  const ad = english.slice();
  for (let i = 0; i < lines.length; i++) {
    if (!english[i]) continue;
    for (let gap = 1; gap <= 3 && i + gap < lines.length; gap++) {
      if (counts[i + gap].french > 0 && !english[i + gap]) break;
      if (english[i + gap]) {
        for (let j = i + 1; j < i + gap; j++) ad[j] = true;
        break;
      }
    }
  }
  // Short English-looking lines on either edge of a break (no French words or accents) belong to it.
  const neutral = (i: number) => counts[i].french === 0 && !/[à-ÿ]/i.test(lines[i].fr) && lines[i].fr.trim().split(/\s+/).length >= 3;
  for (let i = 0; i < lines.length; i++) {
    if (!ad[i] || ad[i - 1] === undefined || ad[i - 1]) continue;
    for (let j = i - 1; j >= Math.max(0, i - 2) && neutral(j); j--) ad[j] = true;
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!ad[i] || i + 1 >= lines.length || ad[i + 1]) continue;
    for (let j = i + 1; j <= Math.min(lines.length - 1, i + 2) && neutral(j); j++) ad[j] = true;
  }
  for (let i = 0; i < lines.length; i++) {
    if (!ad[i]) continue;
    let end = i;
    while (end + 1 < lines.length && ad[end + 1]) end++;
    // Real breaks run for several lines; two English examples in a row are teaching.
    if (end - i < 2 || lines[end].end - lines[i].start < 8) for (let j = i; j <= end; j++) ad[j] = false;
    i = end;
  }
  return lines.map((line, i) => (ad[i] ? { ...line, ad: true } : line));
}

/** Index of the line playing at `time`, or -1 before the first line. Gaps keep the previous line. */
export function lineAt(lines: Line[], time: number): number {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid].start <= time) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

export const TRANSLATION_CHUNK = 40;

/** Chunk start indexes still missing an English line, beginning with the chunk around `from` and wrapping. */
export function pendingChunks(total: number, translated: ReadonlyMap<number, string> | Record<number, string>, from = 0): number[] {
  const has = (i: number) => (translated instanceof Map ? translated.has(i) : i in translated);
  const starts: number[] = [];
  for (let start = 0; start < total; start += TRANSLATION_CHUNK) {
    for (let i = start; i < Math.min(total, start + TRANSLATION_CHUNK); i++) {
      if (!has(i)) {
        starts.push(start);
        break;
      }
    }
  }
  const first = Math.max(0, Math.min(total - 1, from));
  const pivot = starts.findIndex((start) => start + TRANSLATION_CHUNK > first);
  return pivot <= 0 ? starts : [...starts.slice(pivot), ...starts.slice(0, pivot)];
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${rest}` : `${m}:${rest}`;
}

/** "fr-FR" → fr, "en-us" → en; anything else is unknown. */
export function feedLanguage(value: string | null | undefined): Language | null {
  const code = value?.trim().toLowerCase().slice(0, 2);
  return code === "fr" || code === "en" ? code : null;
}

export type ParsedLink =
  | { kind: "spotify"; type: "episode" | "show"; id: string }
  | { kind: "spotify-short"; url: string }
  | { kind: "apple"; showId: string; episodeId: string | null }
  | { kind: "feed"; url: string };

/** A pasted Spotify, Apple Podcasts or RSS link. Text around the link (share sheets add some) is ignored. */
export function parseLink(input: string): ParsedLink | null {
  const raw = /https?:\/\/\S+/i.exec(input.trim())?.[0] ?? input.trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "open.spotify.com") {
    const match = /\/(episode|show)\/([A-Za-z0-9]{10,32})/.exec(url.pathname);
    return match ? { kind: "spotify", type: match[1] as "episode" | "show", id: match[2] } : null;
  }
  if (host === "spotify.link" || host === "spoti.fi") return url.protocol === "https:" ? { kind: "spotify-short", url: url.href } : null;
  if (host === "podcasts.apple.com" || host === "itunes.apple.com") {
    const show = /\/id(\d{3,15})/.exec(url.pathname)?.[1];
    if (!show) return null;
    const episode = url.searchParams.get("i");
    return { kind: "apple", showId: show, episodeId: episode && /^\d{3,20}$/.test(episode) ? episode : null };
  }
  if (url.protocol === "https:" || url.protocol === "http:") return { kind: "feed", url: url.href };
  return null;
}

/** Lowercase words without accents or punctuation, for comparing titles across apps. */
export function titleWords(title: string): string[] {
  return title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/** 1 for the same words, down to 0 for nothing shared. */
export function titleSimilarity(a: string, b: string): number {
  const left = titleWords(a);
  const right = titleWords(b);
  if (!left.length || !right.length) return 0;
  if (left.join(" ") === right.join(" ")) return 1;
  const pool = new Map<string, number>();
  for (const word of right) pool.set(word, (pool.get(word) ?? 0) + 1);
  let shared = 0;
  for (const word of left) {
    const n = pool.get(word) ?? 0;
    if (n > 0) {
      shared++;
      pool.set(word, n - 1);
    }
  }
  return (2 * shared) / (left.length + right.length);
}

export interface EpisodeHint {
  title: string;
  published?: string | null;
  /** Seconds. */
  duration?: number | null;
}

/** The feed episode another app's link points at: a near-identical title, or a close one released the same day. */
export function matchEpisode(episodes: Episode[], hint: EpisodeHint): Episode | null {
  const hintDay = hint.published ? Date.parse(hint.published) : NaN;
  let best: { episode: Episode; score: number } | null = null;
  for (const episode of episodes) {
    let score = titleSimilarity(hint.title, episode.title);
    const days = episode.published && Number.isFinite(hintDay) ? Math.abs(Date.parse(episode.published) - hintDay) / 86_400_000 : null;
    const sameDay = days !== null && days <= 1.5;
    if (score < 0.9 && !(sameDay && score >= 0.4)) continue;
    if (sameDay) score += 0.5;
    if (hint.duration && episode.duration && Math.abs(hint.duration - episode.duration) <= Math.max(60, hint.duration * 0.05)) score += 0.2;
    if (!best || score > best.score) best = { episode, score };
  }
  return best?.episode ?? null;
}

/** URL-safe show id from its title, unique among `taken`. */
export function showSlug(title: string, taken: ReadonlySet<string>): string {
  const base = titleWords(title).join("-").slice(0, 40).replace(/-+$/, "") || "show";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/**
 * Pasted links make the server fetch addresses it was given, so only public
 * HTTPS hosts: no loopback, private ranges, tailnet or bare hostnames.
 */
export function isPublicHttps(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host.includes(".") || /\.(local|localhost|internal|lan|home|ts\.net|arpa)$/.test(host) || host === "localhost") return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) return false;
  return true;
}
