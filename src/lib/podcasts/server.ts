// Podcasts tab: feed cache, episode storage and the download → Whisper →
// translation jobs. Jobs live in this server process (one at a time on the GPU);
// results are files under podcasts/<show>/<episode>/, so a restart only loses
// work in progress, which the player restarts on its next visit.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createWriteStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { getEnabledProviders, runStructured } from "@/lib/ai/providers";
import { SHOWS, TRANSLATION_CHUNK, isPublicHttps, markAds, parseFeed, pendingChunks, showSlug, type Episode, type FeedInfo, type Language, type Line, type Show } from "./model";

const ROOT = process.env.PODCASTS_DIR || path.join(process.cwd(), "podcasts");
const PYTHON = process.env.PODCAST_PYTHON || path.join(os.homedir(), ".hermes/hermes-agent/venv/bin/python3");
const SCRIPT = path.join(process.cwd(), "scripts", "transcribe-podcast.py");
const FEED_TTL_MS = 30 * 60_000;
const MAX_AUDIO_BYTES = 400 * 1024 * 1024;
const MAX_FEED_BYTES = 40 * 1024 * 1024;
const TRANSCRIBE_TIMEOUT_MS = 40 * 60_000;

export type Stage = "idle" | "queued" | "downloading" | "transcribing" | "ready" | "failed";

interface Job {
  stage: Stage;
  progress: number;
  error: string | null;
  translating: boolean;
  translateError: string | null;
  translateFrom: number;
}

interface State {
  feeds: Map<string, { at: number; info: FeedInfo }>;
  jobs: Map<string, Job>;
  gpu: Promise<unknown>;
}

const globalState = globalThis as typeof globalThis & { __frenchPodcasts?: State };
const state: State = (globalState.__frenchPodcasts ??= { feeds: new Map(), jobs: new Map(), gpu: Promise.resolve() });

const SHOWS_FILE = path.join(ROOT, "shows.json");

/** Shows added from pasted links, oldest first. */
async function addedShows(): Promise<Show[]> {
  const saved = (await readJson<Show[]>(SHOWS_FILE)) ?? [];
  return saved.map((show) => ({ ...show, added: true }));
}

export async function allShows(): Promise<Show[]> {
  return [...SHOWS, ...(await addedShows())];
}

export async function findShow(id: string): Promise<Show | undefined> {
  return (await allShows()).find((show) => show.id === id);
}

/** Save a show from a pasted link; the same feed added twice returns the first one. */
export async function addShow(input: { title: string; feed: string; language: Language }): Promise<Show> {
  const existing = (await allShows()).find((show) => show.feed === input.feed);
  if (existing) return existing;
  const added = await addedShows();
  const show: Show = {
    id: showSlug(input.title, new Set((await allShows()).map((s) => s.id))),
    title: input.title.slice(0, 200),
    feed: input.feed,
    language: input.language,
  };
  await writeAtomic(SHOWS_FILE, JSON.stringify([...added.map(({ added: _, ...rest }) => rest), show], null, 1));
  return { ...show, added: true };
}

/** Take an added show off the list. Its downloaded episodes stay on disk, so adding it back keeps them. */
export async function removeShow(id: string) {
  const added = await addedShows();
  await writeAtomic(SHOWS_FILE, JSON.stringify(added.filter((show) => show.id !== id).map(({ added: _, ...rest }) => rest), null, 1));
}

function privateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const lower = address.toLowerCase();
    if (lower.startsWith("::ffff:")) return privateAddress(lower.slice(7));
    return lower === "::1" || lower === "::" || /^(fc|fd|fe8|fe9|fea|feb)/.test(lower);
  }
  const [a, b] = address.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

/** The name must not point into this machine, the LAN or the tailnet. */
async function resolvesPublic(host: string): Promise<boolean> {
  const addresses = await lookup(host, { all: true }).catch(() => []);
  return addresses.length > 0 && addresses.every(({ address }) => !privateAddress(address));
}

/** GET a public HTTPS address, following redirects only to other public HTTPS addresses. */
export async function fetchPublic(url: string, init: { timeoutMs: number; accept?: string }): Promise<Response> {
  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    if (!isPublicHttps(current) || !(await resolvesPublic(new URL(current).hostname))) throw new Error("only public https:// addresses can be fetched");
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(init.timeoutMs),
      headers: { "user-agent": "Mozilla/5.0 (compatible; FrenchTutor/1.0)", ...(init.accept ? { accept: init.accept } : {}) },
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current).href;
      continue;
    }
    return response;
  }
  throw new Error("too many redirects");
}

/** Response body as text, refusing anything over `limit` bytes. */
export async function readText(response: Response, limit: number): Promise<string> {
  if (Number(response.headers.get("content-length")) > limit) throw new Error("response is too large");
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error("response is too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function fetchFeed(feed: string): Promise<FeedInfo> {
  const response = await fetchPublic(feed, { timeoutMs: 30_000 });
  if (!response.ok) throw new Error(`feed returned ${response.status}`);
  const info = parseFeed(await readText(response, MAX_FEED_BYTES));
  if (!info.episodes.length) throw new Error("feed has no episodes");
  return info;
}

const dirFor = (show: string, episode: string) => path.join(ROOT, show, episode);
export const audioPath = (show: string, episode: string) => path.join(dirFor(show, episode), "audio.mp3");
const linesPath = (show: string, episode: string) => path.join(dirFor(show, episode), "lines.json");
/** Translations: en.json (French shows → English), fr.json (English shows → French). */
const translationPath = (show: string, episode: string, target: Language) => path.join(dirFor(show, episode), `${target}.json`);
const positionPath = (show: string, episode: string) => path.join(dirFor(show, episode), "position.json");

async function writeAtomic(file: string, data: string) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  // Unique per write: two saves of the same file (e.g. position on pause and on seek) can overlap.
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

const exists = (file: string) => fs.stat(file).then((s) => s.isFile(), () => false);

/** The feed, refreshed every half hour; the last good copy on disk covers a failed fetch. */
export async function getFeed(show: Show): Promise<FeedInfo> {
  const cached = state.feeds.get(show.id);
  if (cached && Date.now() - cached.at < FEED_TTL_MS) return cached.info;
  const backup = path.join(ROOT, show.id, "feed.json");
  try {
    const info = await fetchFeed(show.feed);
    state.feeds.set(show.id, { at: Date.now(), info });
    await writeAtomic(backup, JSON.stringify(info)).catch(() => {});
    return info;
  } catch (error) {
    const saved = cached?.info ?? (await readJson<FeedInfo>(backup));
    if (saved) return saved;
    throw error;
  }
}

export async function findEpisode(show: Show, id: string): Promise<Episode | undefined> {
  const saved = await readJson<Episode>(path.join(dirFor(show.id, id), "episode.json"));
  if (saved) return saved;
  return (await getFeed(show)).episodes.find((episode) => episode.id === id);
}

const key = (show: string, episode: string) => `${show}/${episode}`;

function jobFor(show: string, episode: string): Job {
  const id = key(show, episode);
  let job = state.jobs.get(id);
  if (!job) {
    job = { stage: "idle", progress: 0, error: null, translating: false, translateError: null, translateFrom: 0 };
    state.jobs.set(id, job);
  }
  return job;
}

interface Spoken { start: number; end: number; text: string; ad?: boolean }

/** What Whisper heard, with ad breaks flagged on French shows (an English show's ads can't be told apart). */
async function spokenLines(show: Show, episode: string): Promise<Spoken[] | null> {
  // Older transcripts store the text as `fr`.
  const raw = (await readJson<{ lines: { start: number; end: number; text?: string; fr?: string }[] }>(linesPath(show.id, episode)))?.lines;
  if (!raw) return null;
  const lines = raw.map(({ start, end, text, fr }) => ({ start, end, text: text ?? fr ?? "" }));
  if (show.language !== "fr") return lines;
  return markAds(lines.map(({ text, ...rest }) => ({ ...rest, fr: text }))).map(({ fr, ...rest }) => ({ ...rest, text: fr }));
}

/** Lines for the player: French on top, and for English shows what is said underneath. */
export async function readLines(show: Show, episode: string): Promise<Line[] | null> {
  const spoken = await spokenLines(show, episode);
  if (!spoken || show.language === "fr") return spoken?.map(({ text, ...rest }) => ({ ...rest, fr: text })) ?? null;
  const french = await readTranslation(show.id, episode, "fr");
  return spoken.map(({ text, ...rest }, i) => (i in french ? { ...rest, fr: french[i], source: text } : { ...rest, fr: "", source: text, pending: true }));
}

export interface Position {
  seconds: number;
  done: boolean;
  at: string;
}

/** Where listening stopped, shared by every device. Only episodes that were opened have a folder. */
export async function readPosition(show: string, episode: string): Promise<Position | null> {
  return readJson<Position>(positionPath(show, episode));
}

export async function writePosition(show: string, episode: string, seconds: number, done: boolean) {
  if (!(await fs.stat(dirFor(show, episode)).catch(() => null))) return;
  const position: Position = { seconds: done ? 0 : Math.round(seconds * 10) / 10, done, at: new Date().toISOString() };
  await writeAtomic(positionPath(show, episode), JSON.stringify(position));
}

export async function readTranslation(show: string, episode: string, target: Language): Promise<Record<number, string>> {
  return (await readJson<Record<number, string>>(translationPath(show, episode, target))) ?? {};
}

export async function episodeStatus(show: string, episode: string) {
  const job = state.jobs.get(key(show, episode));
  const ready = await exists(linesPath(show, episode));
  return {
    stage: ready ? ("ready" as Stage) : job?.stage ?? "idle",
    progress: ready ? 1 : job?.progress ?? 0,
    error: ready ? null : job?.error ?? null,
    audioReady: await exists(audioPath(show, episode)),
    translating: job?.translating ?? false,
    translateError: job?.translateError ?? null,
  };
}

/** Lightweight list status: transcript done, or a job running in this process. */
export async function listStatus(show: string, episode: string): Promise<"ready" | "working" | null> {
  if (await exists(linesPath(show, episode))) return "ready";
  const stage = state.jobs.get(key(show, episode))?.stage;
  return stage === "queued" || stage === "downloading" || stage === "transcribing" ? "working" : null;
}

async function download(episode: Episode, file: string, job: Job) {
  const response = await fetchPublic(episode.audioUrl, { timeoutMs: 15 * 60_000 });
  if (!response.ok || !response.body) throw new Error(`audio download returned ${response.status}`);
  const total = Number(response.headers.get("content-length")) || episode.bytes || 0;
  if (total > MAX_AUDIO_BYTES) throw new Error("audio file is too large");
  let received = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > MAX_AUDIO_BYTES) return callback(new Error("audio file is too large"));
      if (total) job.progress = Math.min(0.99, received / total);
      callback(null, chunk);
    },
  });
  const tmp = `${file}.${process.pid}.part`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), counter, createWriteStream(tmp));
    if (received < 10_000) throw new Error("audio download was empty");
    await fs.rename(tmp, file);
  } catch (error) {
    await fs.rm(tmp, { force: true });
    throw error;
  }
}

function whisper(audio: string, out: string, language: Language, job: Job, duration: number | null) {
  return new Promise<void>((resolve, reject) => {
    // Only what Python and CUDA need: no app secrets in the child.
    const env = { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH, HOME: os.homedir(), LANG: process.env.LANG || "C.UTF-8", HF_HUB_OFFLINE: "1" } as NodeJS.ProcessEnv;
    if (process.env.PODCAST_WHISPER_MODEL) env.PODCAST_WHISPER_MODEL = process.env.PODCAST_WHISPER_MODEL;
    const child = spawn(PYTHON, [SCRIPT, audio, out, language], { stdio: ["ignore", "ignore", "pipe"], env });
    let total = duration ?? 0;
    let tail = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), TRANSCRIBE_TIMEOUT_MS);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (text: string) => {
      tail = (tail + text).slice(-2000);
      for (const line of text.split("\n")) {
        const [word, value] = line.trim().split(" ");
        const seconds = Number(value);
        if (word === "duration" && seconds > 0) total = seconds;
        if (word === "progress" && total > 0) job.progress = Math.min(0.99, seconds / total);
      }
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      const last = tail.trim().split("\n").filter((line) => !line.startsWith("progress")).pop();
      reject(new Error(signal ? `transcription stopped (${signal})` : `transcription failed: ${last?.slice(0, 300) ?? `exit ${code}`}`));
    });
  });
}

/** Queue download + transcription; a no-op when it is done or already running. */
export async function startTranscription(show: Show, episode: Episode) {
  if (await exists(linesPath(show.id, episode.id))) return;
  const job = jobFor(show.id, episode.id);
  if (job.stage === "queued" || job.stage === "downloading" || job.stage === "transcribing") return;
  Object.assign(job, { stage: "queued", progress: 0, error: null });
  await writeAtomic(path.join(dirFor(show.id, episode.id), "episode.json"), JSON.stringify(episode));

  const run = async () => {
    try {
      const audio = audioPath(show.id, episode.id);
      if (!(await exists(audio))) {
        Object.assign(job, { stage: "downloading", progress: 0 });
        await download(episode, audio, job);
      }
      Object.assign(job, { stage: "transcribing", progress: 0 });
      await whisper(audio, linesPath(show.id, episode.id), show.language, job, episode.duration);
      Object.assign(job, { stage: "ready", progress: 1 });
      // An English show is read in French, so translate it right away, from where listening stopped.
      if (show.language === "en") {
        const saved = await readPosition(show.id, episode.id);
        const lines = await spokenLines(show, episode.id);
        const from = saved && !saved.done && lines ? Math.max(0, lines.findLastIndex((line) => line.start <= saved.seconds)) : 0;
        await startTranslation(show, episode.id, from);
      }
    } catch (error) {
      console.error(`[podcasts] ${show.id}/${episode.id}:`, error);
      Object.assign(job, { stage: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  };
  state.gpu = state.gpu.then(run, run);
}

const TranslationSchema = z.object({
  lines: z.array(z.object({ n: z.number().int(), text: z.string() })),
});

const TranslationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["lines"],
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["n", "text"],
        properties: { n: { type: "integer" }, text: { type: "string" } },
      },
    },
  },
} as const;

const SHARED_RULES = [
  "Each line to translate starts with its number. Return exactly one translated line for every number, keeping the numbers.",
  "Translate each line on its own; a line may be part of a sentence, so keep it a fragment rather than borrowing words from neighbouring lines.",
  "Lines marked as context are only there for meaning: do not return them. No notes or explanations.",
];

const SYSTEM: Record<Language, string> = {
  en: ["You translate a French podcast transcript into natural, faithful English for a learner.", ...SHARED_RULES].join(" "),
  fr: [
    "You translate an English podcast transcript into French for an English speaker learning French, who reads your French while hearing the English.",
    "Write the natural spoken French a native speaker would actually say (everyday register, idiomatic, correct grammar and accents), staying faithful to the meaning.",
    "Keep names, brands and titles as they are.",
    ...SHARED_RULES,
  ].join(" "),
};

async function translateChunk(lines: Spoken[], start: number, target: Language) {
  const end = Math.min(lines.length, start + TRANSLATION_CHUNK);
  const out = new Map<number, string>();
  for (let i = start; i < end; i++) if (lines[i].ad || !lines[i].text.trim()) out.set(i, "");
  const numbered = lines.slice(start, end).flatMap((line, offset) => (out.has(start + offset) ? [] : [`${start + offset}. ${line.text}`]));
  if (!numbered.length) return out;
  const before = lines.slice(Math.max(0, start - 3), start).filter((line) => !line.ad).map((line) => `(context) ${line.text}`);
  const user = [...(before.length ? ["Context before:", ...before, ""] : []), "Translate:", ...numbered].join("\n");
  const result = await runStructured({
    purpose: "translate",
    system: SYSTEM[target],
    user,
    schemaName: "podcast_translation",
    jsonSchema: TranslationJsonSchema as Record<string, unknown>,
    timeoutMs: 240_000,
  }, TranslationSchema, await getEnabledProviders());
  for (const { n, text } of result.data.lines) {
    if (n >= start && n < end && !out.has(n) && text.trim()) out.set(n, text.trim());
  }
  return out;
}

/** Two chunks at a time keep an English show's French ahead of the listener. */
const TRANSLATION_WORKERS = 2;

/**
 * Translate missing lines, starting near `from` (the line being played): English
 * for French shows, French for English shows. Seeking moves `from`, and the next
 * chunk picked follows it.
 */
export async function startTranslation(show: Show, episodeId: string, from: number) {
  const lines = await spokenLines(show, episodeId);
  if (!lines) return;
  const target: Language = show.language === "fr" ? "en" : "fr";
  const file = translationPath(show.id, episodeId, target);
  const job = jobFor(show.id, episodeId);
  job.translateFrom = from;
  if (job.translating) return;
  Object.assign(job, { translating: true, translateError: null });

  const claimed = new Set<number>();
  // Writes are serialised so two workers never drop each other's lines.
  let saving = Promise.resolve();
  const save = (added: Record<number, string>) => (saving = saving.then(async () => {
    await writeAtomic(file, JSON.stringify({ ...(await readTranslation(show.id, episodeId, target)), ...added }));
  }));

  const worker = async () => {
    for (;;) {
      const done = await readTranslation(show.id, episodeId, target);
      const next = pendingChunks(lines.length, done, job.translateFrom).find((start) => !claimed.has(start));
      if (next === undefined) return;
      claimed.add(next);
      let added = await translateChunk(lines, next, target);
      if (!added.size) throw new Error("the translation came back empty");
      // A chunk the provider only half answered is retried once; after that, move on.
      if (added.size < Math.min(lines.length, next + TRANSLATION_CHUNK) - next) {
        added = new Map([...(await translateChunk(lines, next, target).catch(() => new Map<number, string>())), ...added]);
        for (let i = next; i < Math.min(lines.length, next + TRANSLATION_CHUNK); i++) if (!added.has(i)) added.set(i, "");
      }
      await save(Object.fromEntries(added));
    }
  };

  void (async () => {
    try {
      const results = await Promise.allSettled(Array.from({ length: show.language === "en" ? TRANSLATION_WORKERS : 1 }, worker));
      const failed = results.find((result) => result.status === "rejected");
      if (failed) throw failed.reason;
    } catch (error) {
      console.error(`[podcasts] translate ${show.id}/${episodeId}:`, error);
      job.translateError = show.language === "en"
        ? "The French translation stopped. Tap Retry to continue."
        : "English is unavailable right now. Turn it off and on to retry.";
    } finally {
      await saving.catch(() => {});
      job.translating = false;
    }
  })();
}
