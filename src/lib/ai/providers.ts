// Structured-JSON completions with provider fallback.
//
// Order is fixed (codex → claude → openai); Settings switches each one on or
// off. The two CLI providers run under the user's ChatGPT / Claude
// subscriptions, so an import costs nothing; the API provider bills per call
// and is off by default. Each CLI is spawned with its API-key env var
// stripped so it can never silently flip to API billing (the Hermes cron
// lesson). Every attempt is logged to provider_events so the UI can say what
// worked and what didn't.

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z, type ZodTypeAny } from "zod";
import { db } from "@/lib/db/client";
import { providerEvents } from "@/lib/db/schema";
import { chatJSON, getModel, getVisionModel } from "@/lib/openai";
import { getSettings } from "@/lib/api";
import { claudeArgs, cliErrorSummary, codexArgs } from "./cli-args";
import {
  DEFAULT_EXTRACT_PROVIDERS,
  PROVIDER_LABELS,
  PROVIDER_ORDER,
  type ProviderId,
} from "@/types";

const HOME = os.homedir();
export const PROVIDER_BIN: Record<"codex" | "claude", string> = {
  codex: process.env.CODEX_BIN || path.join(HOME, ".local/bin/codex"),
  claude: process.env.CLAUDE_BIN || path.join(HOME, ".local/bin/claude"),
};

export type Purpose = "extract" | "grade" | "test" | "variation" | "conversation" | "summary";

export interface StructuredRequest {
  purpose: Purpose;
  system: string;
  user: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  /** Absolute paths of images on disk. CLI providers read them directly. */
  imagePaths?: string[];
  timeoutMs?: number;
  batchId?: number | null;
}

export interface ProviderAttempt {
  provider: ProviderId;
  ok: boolean;
  ms: number;
  model: string | null;
  error: string | null;
}

export interface StructuredResult<T> {
  data: T;
  provider: ProviderId;
  model: string;
  attempts: ProviderAttempt[];
}

export class AllProvidersFailed extends Error {
  attempts: ProviderAttempt[];
  constructor(attempts: ProviderAttempt[]) {
    super(summarizeAttempts(attempts));
    this.name = "AllProvidersFailed";
    this.attempts = attempts;
  }
}

/** "Codex: timeout after 150s · Claude: exit 1 (…)" — or the no-providers message. */
export function summarizeAttempts(attempts: ProviderAttempt[]): string {
  if (attempts.length === 0) {
    return "No AI providers are enabled — turn one on in Settings → Lesson note extraction.";
  }
  return attempts
    .map((a) => `${shortLabel(a.provider)}: ${a.ok ? "ok" : a.error ?? "failed"}`)
    .join(" · ");
}

export function shortLabel(p: ProviderId): string {
  return PROVIDER_LABELS[p].split(" (")[0];
}

export function modelFor(p: ProviderId, purpose: Purpose): string {
  // ChatGPT-account Codex offers gpt-5.6-terra / gpt-5.6-luna / gpt-5.5 / gpt-5.4-mini.
  if (p === "codex") return process.env.CODEX_MODEL || "gpt-5.6-terra";
  if (p === "claude") return process.env.CLAUDE_MODEL || "sonnet";
  return purpose === "extract" ? getVisionModel() : getModel();
}

export async function getEnabledProviders(): Promise<Record<ProviderId, boolean>> {
  const s = await getSettings();
  return { ...DEFAULT_EXTRACT_PROVIDERS, ...(s.extractProviders ?? {}) };
}

/**
 * Try each enabled provider in order until one returns JSON that satisfies
 * `schema`. Throws AllProvidersFailed (with every attempt) when none does.
 */
export async function runStructured<T extends ZodTypeAny>(
  req: StructuredRequest,
  schema: T,
  enabled: Record<ProviderId, boolean>
): Promise<StructuredResult<z.infer<T>>> {
  const attempts: ProviderAttempt[] = [];
  for (const p of PROVIDER_ORDER) {
    if (!enabled[p]) continue;
    const t0 = Date.now();
    try {
      const { raw, model } = await RUNNERS[p](req);
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new Error(
          `returned JSON that doesn't match the schema (${issue?.path.join(".") || "root"}: ${issue?.message})`
        );
      }
      const a: ProviderAttempt = { provider: p, ok: true, ms: Date.now() - t0, model, error: null };
      attempts.push(a);
      await logEvent(req, a);
      return { data: parsed.data, provider: p, model, attempts };
    } catch (err) {
      const a: ProviderAttempt = {
        provider: p,
        ok: false,
        ms: Date.now() - t0,
        model: modelFor(p, req.purpose),
        error: cleanError(err),
      };
      attempts.push(a);
      await logEvent(req, a);
      console.error(`[providers] ${p} failed (${req.purpose}): ${a.error}`);
    }
  }
  throw new AllProvidersFailed(attempts);
}

async function logEvent(req: StructuredRequest, a: ProviderAttempt): Promise<void> {
  try {
    await db.insert(providerEvents).values({
      purpose: req.purpose,
      provider: a.provider,
      ok: a.ok,
      ms: a.ms,
      model: a.model,
      error: a.error,
      batchId: req.batchId ?? null,
    });
  } catch (err) {
    console.error("[providers] could not log event:", err);
  }
}

// ── error hygiene ──

const SECRET = /(sk-[A-Za-z0-9_-]{8,}|Bearer\s+\S+)/g;

function cleanError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(SECRET, "[redacted]").replace(/\s+/g, " ").trim().slice(0, 300);
}

/**
 * Pull the useful line out of CLI noise. Codex logs transient 401s while it
 * refreshes its token and then prints the real reason as a final "ERROR:"
 * line ("You've hit your usage limit … try again at …") — that last one is
 * what the user needs to see.
 */
// ── process runner ──

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function run(
  bin: string,
  args: string[],
  opts: { env: NodeJS.ProcessEnv; cwd: string; timeoutMs: number }
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      // stdin "ignore": codex exec blocks on an open stdin waiting for EOF.
      child = spawn(bin, args, { cwd: opts.cwd, env: opts.env, stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      reject(err);
      return;
    }
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`timeout after ${Math.round(opts.timeoutMs / 1000)}s`));
    }, opts.timeoutMs);
    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(
        err.code === "ENOENT"
          ? new Error(`${path.basename(bin)} is not installed at ${bin}`)
          : err
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

function envWithout(keys: string[]): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of keys) delete env[k];
  env.HOME = env.HOME || HOME;
  // systemd user services get a minimal PATH; both CLIs live in ~/.local/bin.
  env.PATH = `${path.join(HOME, ".local/bin")}:${env.PATH ?? "/usr/local/bin:/usr/bin:/bin"}`;
  return env;
}

const DEFAULT_TIMEOUT: Record<Purpose, number> = {
  extract: 150_000,
  grade: 60_000,
  test: 60_000,
  variation: 75_000,
  conversation: 75_000,
  summary: 75_000,
};

// ── runners ──

type Runner = (req: StructuredRequest) => Promise<{ raw: unknown; model: string }>;

const runCodex: Runner = async (req) => {
  const model = modelFor("codex", req.purpose);
  const effort = process.env.CODEX_REASONING_EFFORT || "low";
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ft-codex-"));
  try {
    const schemaPath = path.join(dir, "schema.json");
    const outPath = path.join(dir, "out.json");
    await fs.writeFile(schemaPath, JSON.stringify(req.jsonSchema));
    const args = codexArgs({
      model,
      effort,
      schemaPath,
      outPath,
      cwd: dir,
      imagePaths: req.imagePaths ?? [],
      prompt: `${req.system}\n\n${req.user}`,
    });
    const r = await run(PROVIDER_BIN.codex, args, {
      env: envWithout(["OPENAI_API_KEY"]),
      cwd: dir,
      timeoutMs: req.timeoutMs ?? DEFAULT_TIMEOUT[req.purpose],
    });
    if (r.code !== 0) {
      throw new Error(`exit ${r.code}: ${cliErrorSummary(r.stderr + "\n" + r.stdout) || "no output"}`);
    }
    const text = await fs.readFile(outPath, "utf8").catch(() => "");
    if (!text.trim()) throw new Error("finished without writing structured output");
    return { raw: JSON.parse(text), model };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
};

const runClaude: Runner = async (req) => {
  const model = modelFor("claude", req.purpose);
  const images = req.imagePaths ?? [];
  const prompt = [
    req.system,
    "",
    images.length > 0
      ? `First, use the Read tool to open each of these image files — they are the notebook photos referred to below:\n${images.map((p) => `- ${p}`).join("\n")}`
      : "",
    "",
    req.user,
  ].join("\n");
  const args = claudeArgs({
    model,
    effort: process.env.CLAUDE_EFFORT || "medium",
    jsonSchema: req.jsonSchema,
    maxTurns: 3 + images.length,
    prompt,
  });
  const cwd = images.length > 0 ? path.dirname(images[0]) : os.tmpdir();
  const r = await run(PROVIDER_BIN.claude, args, {
    env: envWithout(["ANTHROPIC_API_KEY", "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT"]),
    cwd,
    timeoutMs: req.timeoutMs ?? DEFAULT_TIMEOUT[req.purpose],
  });
  if (r.code !== 0) {
    throw new Error(`exit ${r.code}: ${cliErrorSummary(r.stderr + "\n" + r.stdout) || "no output"}`);
  }
  let out: {
    is_error?: boolean;
    subtype?: string;
    result?: string;
    structured_output?: unknown;
  };
  try {
    out = JSON.parse(r.stdout);
  } catch {
    throw new Error(`non-JSON output: ${cliErrorSummary(r.stdout)}`);
  }
  if (out.is_error) throw new Error(String(out.result ?? out.subtype ?? "error"));
  if (out.structured_output === undefined) {
    throw new Error(`no structured output (${out.subtype ?? "unknown"}): ${String(out.result ?? "").slice(0, 120)}`);
  }
  return { raw: out.structured_output, model };
};

const runOpenAI: Runner = async (req) => {
  const model = modelFor("openai", req.purpose);
  const images = await Promise.all(
    (req.imagePaths ?? []).map(async (p) => {
      const buf = await fs.readFile(p);
      const ext = p.split(".").pop();
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      return `data:${mime};base64,${buf.toString("base64")}`;
    })
  );
  const raw = await chatJSON({
    system: req.system,
    user: req.user,
    schema: z.unknown(),
    schemaName: req.schemaName,
    jsonSchema: req.jsonSchema,
    model,
    images,
    imageDetail: "high",
  });
  return { raw, model };
};

const RUNNERS: Record<ProviderId, Runner> = {
  codex: runCodex,
  claude: runClaude,
  openai: runOpenAI,
};

/** Is the provider usable at all on this machine (binary present / key set)? */
export async function providerInstalled(p: ProviderId): Promise<boolean> {
  if (p === "openai") return !!process.env.OPENAI_API_KEY;
  try {
    await fs.access(PROVIDER_BIN[p]);
    return true;
  } catch {
    return false;
  }
}
