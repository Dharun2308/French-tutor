// Pure helpers for the Podcasts tab: RSS parsing, transcript lines and
// translation chunks. No I/O here so node --test can cover it.

export interface Show {
  id: string;
  title: string;
  feed: string;
}

/** Shows are fixed in code: the server only ever downloads from these feeds. */
export const SHOWS: Show[] = [
  { id: "little-talk-slow-french", title: "Little Talk in Slow French", feed: "https://www.spreaker.com/show/6084166/episodes/feed" },
  { id: "innerfrench", title: "InnerFrench", feed: "https://podcast.innerfrench.com/feed.xml" },
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
  episodes: Episode[];
}

export interface Line {
  start: number;
  end: number;
  fr: string;
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
