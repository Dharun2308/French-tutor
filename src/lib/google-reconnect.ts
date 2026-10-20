// Server only: credential material never leaves this module.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod, lstat, mkdir, open, readFile, readdir, realpath, rename, stat, unlink,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DESKTOP_REDIRECT = "http://127.0.0.1:8767/";
const DOCS_READ = "https://www.googleapis.com/auth/documents.readonly";
const DOCS_WRITE = "https://www.googleapis.com/auth/documents";
export const GOOGLE_RECONNECT_TTL_MS = 10 * 60 * 1000;
const STATUS_TTL_MS = 30_000;
const MAX_PENDING = 64;
const MAX_FILE_BYTES = 1024 * 1024;

type Json = Record<string, unknown>;
export type GoogleClientType = "desktop" | "web";
export type GoogleConnection = "connected" | "needs-reconnect" | "unavailable";
export type GoogleConnectionStatus = {
  connection: GoogleConnection;
  clientType: GoogleClientType | null;
  redirectUri?: string;
};
export type GoogleLastImport = {
  result: "success" | "failed" | "running" | "never" | "unknown";
  at: string | null;
};
export type GoogleReconnectStart = {
  authorizationUrl: string;
  clientType: GoogleClientType;
  redirectUri?: string;
};
export type GoogleReconnectFinish = {
  callbackUrl: string;
  origin: string;
  browserNonce: string;
  mode: "paste" | "redirect";
};
export type GoogleReconnectOptions = {
  configPath?: string;
  clientFile?: string;
  stateDirectory?: string;
  fetch?: typeof fetch;
  now?: () => number;
};

export class GoogleReconnectError extends Error {
  constructor(
    public readonly code: "invalid-callback" | "expired" | "configuration" | "consent" |
      "account" | "scopes" | "unavailable" | "conflict" | "needs-reconnect",
    message: string,
  ) {
    super(message);
    this.name = "GoogleReconnectError";
  }
}

const fail = (code: GoogleReconnectError["code"], message: string): never => {
  throw new GoogleReconnectError(code, message);
};
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const safeEqual = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const expand = (value: string) => value.startsWith("~/") ? path.join(homedir(), value.slice(2)) : path.resolve(value);

function record(value: unknown): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail("configuration", "Google connection is not configured.");
  }
  return value as Json;
}

async function privateJson(file: string): Promise<{ value: Json; raw: string }> {
  const handle = await open(file, constants.O_RDONLY);
  try {
    if ((await handle.stat()).size > MAX_FILE_BYTES) {
      return fail("configuration", "Google connection is not configured.");
    }
    const raw = await handle.readFile("utf8");
    return { value: record(JSON.parse(raw)), raw };
  } finally {
    await handle.close();
  }
}

function normalizeOrigin(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
    (url.protocol !== "https:" && !(url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]")))) {
    return fail("configuration", "Google connection is not configured.");
  }
  return url.origin;
}

export function createGooglePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

/** Accept a complete callback address only; duplicate parameters are ambiguous. */
export function parseGoogleCallback(callbackUrl: string, redirectUri: string): { state: string; code: string } {
  if (typeof callbackUrl !== "string" || callbackUrl.length > 16_384) {
    return fail("invalid-callback", "Paste the complete Google callback address.");
  }
  let url: URL;
  try {
    url = new URL(callbackUrl.trim());
  } catch {
    return fail("invalid-callback", "Paste the complete Google callback address.");
  }
  const expected = new URL(redirectUri);
  if (url.origin !== expected.origin || url.pathname !== expected.pathname ||
    url.username || url.password || url.hash) {
    return fail("invalid-callback", "Paste the complete Google callback address.");
  }
  const seen = new Set<string>();
  for (const name of url.searchParams.keys()) {
    if (seen.has(name)) return fail("invalid-callback", "This Google callback address is not valid.");
    seen.add(name);
  }
  const state = url.searchParams.get("state");
  if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state)) {
    return fail("invalid-callback", "This Google callback address is not valid.");
  }
  if (url.searchParams.has("error")) {
    // Preserve state so a denied consent attempt is consumed by finish().
    return { state, code: "" };
  }
  const code = url.searchParams.get("code");
  if (!code || code.length > 4096 || /[\u0000-\u001f\u007f]/.test(code)) {
    return fail("invalid-callback", "This Google callback address is not valid.");
  }
  return { state, code };
}

function scopes(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length ||
    value.some((scope) => !text(scope) || /\s/.test(scope))) {
    return fail("configuration", "Google connection is not configured.");
  }
  return [...new Set(value as string[])].sort();
}

function checkScopes(required: string[], granted: unknown): void {
  if (!text(granted)) return fail("scopes", "Allow the existing Google permissions and try again.");
  const actual = new Set(granted.split(/\s+/).filter(Boolean));
  const wanted = new Set(required);
  for (const scope of wanted) {
    if (!actual.has(scope) && !(scope === DOCS_READ && wanted.has(DOCS_WRITE) && actual.has(DOCS_WRITE))) {
      return fail("scopes", "Allow the existing Google permissions and try again.");
    }
  }
  // Reject added permissions as well as missing ones. Google's sole expected
  // normalization here is collapsing documents.readonly into documents.
  if ([...actual].some((scope) => !wanted.has(scope))) {
    return fail("scopes", "Google returned different permissions. Start again.");
  }
}

type Configuration = {
  tokenPath: string;
  tokenResolved: string;
  token: Json;
  tokenHash: string;
  clientHash: string;
  client: { id: string; secret: string; type: GoogleClientType };
  scopes: string[];
  documentId: string;
  account: string;
  stateDirectory: string;
};
type Pending = {
  createdAt: number;
  browserHash: string;
  origin: string;
  redirectUri: string;
  clientType: GoogleClientType;
  verifier: string;
  tokenHash: string;
  clientHash: string;
  tokenResolved: string;
};

function expectedAccount(config: Json, token: Json, tokenPath: string): string {
  const explicit = config.google_account || token.account;
  if (text(explicit) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(explicit)) return explicit.toLowerCase();
  const match = path.basename(tokenPath).match(/^google_token_([^/]+)\.json$/);
  if (!match) return fail("configuration", "Google connection is not configured.");
  const account = match[1].includes("@") ? match[1] : `${match[1]}@gmail.com`;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(account)) {
    return fail("configuration", "Google connection is not configured.");
  }
  return account.toLowerCase();
}

/** Atomic replacement preserves Python Credentials.to_json() and symlinks. */
export async function writeGoogleToken(
  tokenPath: string, expectedResolved: string, expectedHash: string, payload: Json,
): Promise<void> {
  const resolved = await realpath(tokenPath);
  if (resolved !== expectedResolved) return fail("conflict", "Google credentials changed. Start again.");
  const lockPath = `${resolved}.reconnect.lock`;
  let lock;
  try {
    lock = await open(lockPath, "wx", 0o600);
  } catch {
    return fail("conflict", "Google credentials are being updated. Try again.");
  }
  const suffix = `${Date.now()}-${randomBytes(12).toString("hex")}`;
  const temporary = path.join(path.dirname(resolved), `.${path.basename(resolved)}.reconnect-${suffix}.tmp`);
  const backup = `${resolved}.bak-reconnect-${suffix}`;
  try {
    const previous = await readFile(resolved, "utf8");
    if (hash(previous) !== expectedHash || await realpath(tokenPath) !== expectedResolved) {
      return fail("conflict", "Google credentials changed. Start again.");
    }
    await writePrivate(temporary, JSON.stringify(payload, null, 2) + "\n");
    await writePrivate(backup, previous);
    // Recheck for changes by external writers that do not use this lock.
    if (hash(await readFile(resolved, "utf8")) !== expectedHash ||
      await realpath(tokenPath) !== expectedResolved) {
      return fail("conflict", "Google credentials changed. Start again.");
    }
    await rename(temporary, resolved);
    const directory = await open(path.dirname(resolved), constants.O_RDONLY);
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } finally {
    await unlink(temporary).catch(() => {});
    await lock.close();
    await unlink(lockPath).catch(() => {});
  }
}

async function writePrivate(file: string, data: string): Promise<void> {
  const handle = await open(file, "wx", 0o600);
  try {
    await handle.writeFile(data, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export class GoogleReconnectService {
  private readonly configPath: string;
  private readonly clientFile?: string;
  private readonly stateDirectory?: string;
  private readonly request: typeof fetch;
  private readonly now: () => number;
  private statusCache?: { key: string; expires: number; value: Promise<GoogleConnectionStatus> };

  constructor(options: GoogleReconnectOptions = {}) {
    this.configPath = expand(options.configPath || process.env.FRENCH_GOOGLE_DOCS_CONFIG ||
      path.join(homedir(), ".hermes", "french-google-docs.json"));
    this.clientFile = options.clientFile || process.env.GOOGLE_RECONNECT_CLIENT_FILE;
    this.stateDirectory = options.stateDirectory || process.env.GOOGLE_RECONNECT_STATE_DIR;
    this.request = options.fetch || fetch;
    this.now = options.now || Date.now;
  }

  private async configuration(): Promise<Configuration> {
    const config = (await privateJson(this.configPath)).value;
    if (!text(config.google_token_file) || !text(config.state_directory) ||
      !Array.isArray(config.document_ids) || !text(config.document_ids[0]) ||
      !/^[A-Za-z0-9_-]+$/.test(config.document_ids[0])) {
      return fail("configuration", "Google connection is not configured.");
    }
    const tokenPath = expand(config.google_token_file);
    const tokenResolved = await realpath(tokenPath);
    const token = await privateJson(tokenResolved);
    const clientPath = this.clientFile || (text(config.google_client_file) ? config.google_client_file :
      path.join(path.dirname(tokenPath), path.basename(tokenPath).replace(/^google_token_/, "google_client_secret_")));
    const clientFile = await privateJson(expand(clientPath));
    const type = clientFile.value.web ? "web" : "desktop";
    const client = record(clientFile.value.web || clientFile.value.installed);
    if (!text(client.client_id) || !text(client.client_secret)) {
      return fail("configuration", "Google connection is not configured.");
    }
    const granted = scopes(token.value.scopes);
    // Preserve the current grants even if another shared-token writer removed
    // Docs access. Only Google's read-only metadata check can confirm access.
    return {
      tokenPath, tokenResolved, token: token.value, tokenHash: hash(token.raw),
      clientHash: hash(clientFile.raw),
      client: { id: client.client_id, secret: client.client_secret, type },
      scopes: granted, documentId: config.document_ids[0],
      account: expectedAccount(config, token.value, tokenPath),
      stateDirectory: expand(this.stateDirectory || path.join(path.dirname(tokenPath), ".french-google-reconnect")),
    };
  }

  private async pendingDirectory(directory: string): Promise<void> {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      return fail("configuration", "Google connection is not configured.");
    }
    await chmod(directory, 0o700);
    const files = await readdir(directory);
    let active = 0;
    for (const name of files) {
      if (!/^[a-f0-9]{64}\.json(?:\.claimed-[a-f0-9]+)?$/.test(name)) continue;
      const file = path.join(directory, name);
      try {
        const info = await stat(file);
        if (this.now() - info.mtimeMs >= GOOGLE_RECONNECT_TTL_MS) await unlink(file);
        else active += 1;
      } catch {
        // Another request may have consumed or cleaned this state.
      }
    }
    if (active >= MAX_PENDING) {
      return fail("unavailable", "Please wait a few minutes before reconnecting again.");
    }
  }

  async begin(origin: string, browserNonce: string): Promise<GoogleReconnectStart> {
    try {
      const normalized = normalizeOrigin(origin);
      if (!/^[A-Za-z0-9_-]{43,128}$/.test(browserNonce)) {
        return fail("invalid-callback", "Open Google reconnect again.");
      }
      const config = await this.configuration();
      await this.pendingDirectory(config.stateDirectory);
      const state = randomBytes(32).toString("base64url");
      const { verifier, challenge } = createGooglePkce();
      const redirectUri = config.client.type === "web" ? `${normalized}/api/google/callback` : DESKTOP_REDIRECT;
      const pending: Pending = {
        createdAt: this.now(), browserHash: hash(browserNonce), origin: normalized, redirectUri,
        clientType: config.client.type, verifier, tokenHash: config.tokenHash,
        clientHash: config.clientHash, tokenResolved: config.tokenResolved,
      };
      await writePrivate(path.join(config.stateDirectory, `${hash(state)}.json`), JSON.stringify(pending));
      const url = new URL(AUTHORIZATION_URL);
      url.search = new URLSearchParams({
        client_id: config.client.id,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: config.scopes.join(" "),
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "false",
      }).toString();
      return {
        authorizationUrl: url.href, clientType: config.client.type,
        ...(config.client.type === "web" ? { redirectUri } : {}),
      };
    } catch (error) {
      if (error instanceof GoogleReconnectError) throw error;
      return fail("configuration", "Google connection is not configured.");
    }
  }

  private async claim(
    state: string, config: Configuration, origin: string, browserNonce: string, redirectUri: string,
  ): Promise<Pending> {
    const file = path.join(config.stateDirectory, `${hash(state)}.json`);
    let pending: Pending;
    try {
      pending = (await privateJson(file)).value as unknown as Pending;
    } catch {
      return fail("expired", "This reconnect link expired or was already used. Start again.");
    }
    if (!text(browserNonce) || !text(pending.browserHash) || !safeEqual(pending.browserHash, hash(browserNonce)) ||
      pending.origin !== origin || pending.redirectUri !== redirectUri) {
      return fail("invalid-callback", "Use the same browser where you started reconnecting.");
    }
    // Rename claims the state exactly once even across processes and route bundles.
    const claimed = `${file}.claimed-${randomBytes(12).toString("hex")}`;
    try {
      await rename(file, claimed);
    } catch {
      return fail("expired", "This reconnect link expired or was already used. Start again.");
    }
    await unlink(claimed).catch(() => {});
    if (!Number.isFinite(pending.createdAt) || this.now() - pending.createdAt >= GOOGLE_RECONNECT_TTL_MS ||
      pending.createdAt > this.now()) {
      return fail("expired", "This reconnect link expired. Start again.");
    }
    if (pending.tokenHash !== config.tokenHash || pending.clientHash !== config.clientHash ||
      pending.tokenResolved !== config.tokenResolved || pending.clientType !== config.client.type) {
      return fail("conflict", "Google credentials changed. Start again.");
    }
    return pending;
  }

  private async googleJson(url: string, options: RequestInit): Promise<{ status: number; body: Json }> {
    try {
      const response = await this.request(url, {
        ...options, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000),
      });
      const body: unknown = await response.json();
      return { status: response.status, body: record(body) };
    } catch {
      return fail("unavailable", "Google is unavailable. Try again shortly.");
    }
  }

  private async exchange(body: URLSearchParams): Promise<Json> {
    const result = await this.googleJson(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (result.status !== 200) {
      if (result.body.error === "invalid_grant") {
        return fail("needs-reconnect", "Google needs to be reconnected. Start again.");
      }
      return fail("unavailable", "Google could not complete the connection. Try again.");
    }
    if (!text(result.body.access_token) || result.body.token_type?.toString().toLowerCase() !== "bearer") {
      return fail("unavailable", "Google could not complete the connection. Try again.");
    }
    return result.body;
  }

  private async verifyDocument(config: Configuration, accessToken: string): Promise<void> {
    const result = await this.googleJson(
      `https://docs.googleapis.com/v1/documents/${encodeURIComponent(config.documentId)}?fields=documentId`,
      { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (result.status === 401) return fail("needs-reconnect", "Google needs to be reconnected.");
    if (result.status === 403) return fail("scopes", "Google could not access your notes.");
    if (result.status !== 200 || result.body.documentId !== config.documentId) {
      return fail("unavailable", "Google could not check your notes. Try again.");
    }
  }

  async finish(input: GoogleReconnectFinish): Promise<void> {
    try {
      const origin = normalizeOrigin(input.origin);
      const config = await this.configuration();
      const redirectUri = input.mode === "redirect" ? `${origin}/api/google/callback` : DESKTOP_REDIRECT;
      if ((input.mode === "redirect") !== (config.client.type === "web")) {
        return fail("invalid-callback", "Open Google reconnect again.");
      }
      const callback = parseGoogleCallback(input.callbackUrl, redirectUri);
      const pending = await this.claim(callback.state, config, origin, input.browserNonce, redirectUri);
      if (!callback.code) return fail("consent", "Google connection was cancelled.");
      const fresh = await this.exchange(new URLSearchParams({
        grant_type: "authorization_code", code: callback.code, redirect_uri: redirectUri,
        client_id: config.client.id, client_secret: config.client.secret, code_verifier: pending.verifier,
      }));
      checkScopes(config.scopes, fresh.scope);
      if (!text(fresh.refresh_token)) {
        return fail("consent", "Google did not provide offline access. Reconnect and allow access again.");
      }
      const expires = fresh.expires_in;
      if (typeof expires !== "number" || !Number.isFinite(expires) || expires <= 0 || expires > 86_400) {
        return fail("unavailable", "Google could not complete the connection. Try again.");
      }
      const accessToken = fresh.access_token as string;
      const account = await this.googleJson("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        method: "GET", headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (account.status !== 200 || !text(account.body.emailAddress) ||
        account.body.emailAddress.toLowerCase() !== config.account) {
        return fail("account", "Choose the Google account already connected to your notes.");
      }
      await this.verifyDocument(config, accessToken);
      const payload = {
        ...config.token,
        token: accessToken,
        refresh_token: fresh.refresh_token,
        client_id: config.client.id,
        client_secret: config.client.secret,
        token_uri: TOKEN_URL,
        scopes: config.scopes,
        expiry: new Date(this.now() + expires * 1000).toISOString(),
      };
      await writeGoogleToken(config.tokenPath, config.tokenResolved, config.tokenHash, payload);
      this.statusCache = undefined;
    } catch (error) {
      if (error instanceof GoogleReconnectError) throw error;
      return fail("unavailable", "Google could not complete the connection. Try again.");
    }
  }

  private async checkStatus(config: Configuration, origin: string): Promise<GoogleConnectionStatus> {
    const base = {
      clientType: config.client.type,
      ...(config.client.type === "web" ? { redirectUri: `${origin}/api/google/callback` } : {}),
    };
    try {
      if (!text(config.token.refresh_token) || !text(config.token.client_id) || !text(config.token.client_secret)) {
        return { ...base, connection: "needs-reconnect" };
      }
      // Refresh only in memory; checking the connection never rewrites credentials.
      const response = await this.exchange(new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: config.token.refresh_token,
        client_id: config.token.client_id,
        client_secret: config.token.client_secret,
      }));
      if (response.scope) checkScopes(config.scopes, response.scope);
      await this.verifyDocument(config, response.access_token as string);
      return { ...base, connection: "connected" };
    } catch (error) {
      return {
        ...base,
        connection: error instanceof GoogleReconnectError && error.code === "needs-reconnect"
          ? "needs-reconnect" : "unavailable",
      };
    }
  }

  async status(origin: string): Promise<GoogleConnectionStatus> {
    try {
      const normalized = normalizeOrigin(origin);
      const config = await this.configuration();
      const key = `${normalized}:${config.tokenHash}:${config.clientHash}`;
      if (this.statusCache?.key === key && this.statusCache.expires > this.now()) return this.statusCache.value;
      const value = this.checkStatus(config, normalized);
      this.statusCache = { key, expires: this.now() + STATUS_TTL_MS, value };
      return value;
    } catch {
      return { connection: "unavailable", clientType: null };
    }
  }

  async lastImport(): Promise<GoogleLastImport> {
    try {
      const config = (await privateJson(this.configPath)).value;
      if (!text(config.state_directory)) return { result: "never", at: null };
      let state: Json;
      try {
        state = (await privateJson(path.join(expand(config.state_directory), "state.json"))).value;
      } catch (error) {
        return { result: (error as NodeJS.ErrnoException).code === "ENOENT" ? "never" : "unknown", at: null };
      }
      const timestamp = state.lastAttemptAt || state.lastSuccessAt;
      const at = text(timestamp) && Number.isFinite(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : null;
      if (state.running === true) {
        const interrupted = !at || this.now() - Date.parse(at) > 130 * 60_000;
        return { result: interrupted ? "failed" : "running", at };
      }
      if (Array.isArray(state.errors) && state.errors.length) return { result: "failed", at };
      if (state.lastSuccessAt) return { result: "success", at };
      return { result: "unknown", at: null };
    } catch {
      return { result: "never", at: null };
    }
  }
}

// Shared across Next route bundles and reloads; persisted state handles restarts.
const runtime = globalThis as typeof globalThis & {
  frenchGoogleReconnect?: { key: string; service: GoogleReconnectService };
};
function service(): GoogleReconnectService {
  const key = [process.env.FRENCH_GOOGLE_DOCS_CONFIG, process.env.GOOGLE_RECONNECT_CLIENT_FILE,
    process.env.GOOGLE_RECONNECT_STATE_DIR].join("|");
  if (!runtime.frenchGoogleReconnect || runtime.frenchGoogleReconnect.key !== key) {
    runtime.frenchGoogleReconnect = { key, service: new GoogleReconnectService() };
  }
  return runtime.frenchGoogleReconnect.service;
}
export const beginGoogleReconnect = (origin: string, browserNonce: string) => service().begin(origin, browserNonce);
export const finishGoogleReconnect = (input: GoogleReconnectFinish) => service().finish(input);
export const getGoogleConnectionStatus = (origin: string) => service().status(origin);
export const getGoogleLastImport = () => service().lastImport();
