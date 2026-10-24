// Podcasts tab: feed cache, episode storage and the download → Whisper →
// translation jobs. Jobs live in this server process (one at a time on the GPU);
// results are files under podcasts/<show>/<episode>/, so a restart only loses
// work in progress, which the player restarts on its next visit.

import { spawn } from "node:child_process";
import { createWriteStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { getEnabledProviders, runStructured } from "@/lib/ai/providers";
import { SHOWS, TRANSLATION_CHUNK, markAds, parseFeed, pendingChunks, type Episode, type FeedInfo, type Line, type Show } from "./model";

const ROOT = process.env.PODCASTS_DIR || path.join(process.cwd(), "podcasts");
const PYTHON = process.env.PODCAST_PYTHON || path.join(os.homedir(), ".hermes/hermes-agent/venv/bin/python3");
const SCRIPT = path.join(process.cwd(), "scripts", "transcribe-podcast.py");
const FEED_TTL_MS = 30 * 60_000;
const MAX_AUDIO_BYTES = 400 * 1024 * 1024;
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

export function findShow(id: string): Show | undefined {
  return SHOWS.find((show) => show.id === id);
}

const dirFor = (show: string, episode: string) => path.join(ROOT, show, episode);
export const audioPath = (show: string, episode: string) => path.join(dirFor(show, episode), "audio.mp3");
const linesPath = (show: string, episode: string) => path.join(dirFor(show, episode), "lines.json");
const englishPath = (show: string, episode: string) => path.join(dirFor(show, episode), "en.json");

async function writeAtomic(file: string, data: string) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
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
    const response = await fetch(show.feed, { signal: AbortSignal.timeout(20_000), headers: { "user-agent": "FrenchTutor/1.0" } });
    if (!response.ok) throw new Error(`feed returned ${response.status}`);
    const info = parseFeed(await response.text());
    if (!info.episodes.length) throw new Error("feed has no episodes");
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

export async function readLines(show: string, episode: string): Promise<Line[] | null> {
  const lines = (await readJson<{ lines: Line[] }>(linesPath(show, episode)))?.lines;
  return lines ? markAds(lines) : null;
}

export async function readEnglish(show: string, episode: string): Promise<Record<number, string>> {
  return (await readJson<Record<number, string>>(englishPath(show, episode))) ?? {};
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
  const response = await fetch(episode.audioUrl, { redirect: "follow", signal: AbortSignal.timeout(15 * 60_000), headers: { "user-agent": "FrenchTutor/1.0" } });
  if (!response.ok || !response.body) throw new Error(`audio download returned ${response.status}`);
  if (!/^https:/.test(response.url)) throw new Error("audio redirected to a non-HTTPS address");
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

function whisper(audio: string, out: string, job: Job, duration: number | null) {
  return new Promise<void>((resolve, reject) => {
    // Only what Python and CUDA need: no app secrets in the child.
    const env = { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH, HOME: os.homedir(), LANG: process.env.LANG || "C.UTF-8", HF_HUB_OFFLINE: "1" } as NodeJS.ProcessEnv;
    if (process.env.PODCAST_WHISPER_MODEL) env.PODCAST_WHISPER_MODEL = process.env.PODCAST_WHISPER_MODEL;
    const child = spawn(PYTHON, [SCRIPT, audio, out], { stdio: ["ignore", "ignore", "pipe"], env });
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
      await whisper(audio, linesPath(show.id, episode.id), job, episode.duration);
      Object.assign(job, { stage: "ready", progress: 1 });
    } catch (error) {
      console.error(`[podcasts] ${show.id}/${episode.id}:`, error);
      Object.assign(job, { stage: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  };
  state.gpu = state.gpu.then(run, run);
}

const TranslationSchema = z.object({
  lines: z.array(z.object({ n: z.number().int(), en: z.string() })),
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
        required: ["n", "en"],
        properties: { n: { type: "integer" }, en: { type: "string" } },
      },
    },
  },
} as const;

const SYSTEM = [
  "You translate a French podcast transcript into natural, faithful English for a learner.",
  "Each line to translate starts with its number. Return exactly one English line for every number, keeping the numbers.",
  "Translate each line on its own; a line may be part of a sentence, so keep it a fragment rather than borrowing words from neighbouring lines.",
  "Lines marked as context are only there for meaning: do not return them. No notes or explanations.",
].join(" ");

async function translateChunk(lines: Line[], start: number) {
  const end = Math.min(lines.length, start + TRANSLATION_CHUNK);
  const out = new Map<number, string>();
  for (let i = start; i < end; i++) if (lines[i].ad) out.set(i, "");
  const numbered = lines.slice(start, end).flatMap((line, offset) => (line.ad ? [] : [`${start + offset}. ${line.fr}`]));
  if (!numbered.length) return out;
  const before = lines.slice(Math.max(0, start - 3), start).filter((line) => !line.ad).map((line) => `(context) ${line.fr}`);
  const user = [...(before.length ? ["Context before:", ...before, ""] : []), "Translate:", ...numbered].join("\n");
  const result = await runStructured({
    purpose: "translate",
    system: SYSTEM,
    user,
    schemaName: "podcast_translation",
    jsonSchema: TranslationJsonSchema as Record<string, unknown>,
    timeoutMs: 240_000,
  }, TranslationSchema, await getEnabledProviders());
  for (const { n, en } of result.data.lines) {
    if (n >= start && n < end && !lines[n].ad && en.trim()) out.set(n, en.trim());
  }
  return out;
}

/** Translate missing English lines, starting near `from` (the line being played). */
export async function startTranslation(show: Show, episodeId: string, from: number) {
  const lines = await readLines(show.id, episodeId);
  if (!lines) return;
  const job = jobFor(show.id, episodeId);
  job.translateFrom = from;
  if (job.translating) return;
  Object.assign(job, { translating: true, translateError: null });

  void (async () => {
    try {
      for (;;) {
        const english = await readEnglish(show.id, episodeId);
        const [next] = pendingChunks(lines.length, english, job.translateFrom);
        if (next === undefined) break;
        const added = await translateChunk(lines, next);
        if (!added.size) throw new Error("the translation came back empty");
        const merged = { ...(await readEnglish(show.id, episodeId)), ...Object.fromEntries(added) };
        await writeAtomic(englishPath(show.id, episodeId), JSON.stringify(merged));
        // A chunk the provider only half answered is retried once; after that, move on.
        if (pendingChunks(lines.length, merged, next)[0] === next) {
          const retry = await translateChunk(lines, next);
          const fixed: Record<number, string> = { ...merged, ...Object.fromEntries(retry) };
          for (let i = next; i < Math.min(lines.length, next + TRANSLATION_CHUNK); i++) fixed[i] ??= "";
          await writeAtomic(englishPath(show.id, episodeId), JSON.stringify(fixed));
        }
      }
    } catch (error) {
      console.error(`[podcasts] translate ${show.id}/${episodeId}:`, error);
      job.translateError = "English is unavailable right now. Turn it off and on to retry.";
    } finally {
      job.translating = false;
    }
  })();
}
