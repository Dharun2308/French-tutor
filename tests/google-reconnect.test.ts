import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  createGooglePkce, GOOGLE_RECONNECT_TTL_MS, GoogleReconnectError,
  GoogleReconnectService, parseGoogleCallback, writeGoogleToken,
} from "../src/lib/google-reconnect";

const origin = "https://tutor.example:10000";
const nonce = "b".repeat(43);
const redirect = "http://127.0.0.1:8767/";
const permissions = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar",
];
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const isError = (code: string) => (error: unknown) =>
  error instanceof GoogleReconnectError && error.code === code;

async function fixture(t: TestContext, type: "installed" | "web" = "installed") {
  const root = await mkdtemp(path.join(tmpdir(), "french-reconnect-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const tokenPath = path.join(root, "google_token_fixture@example.test.json");
  const clientPath = path.join(root, "google_client_secret_fixture@example.test.json");
  const configPath = path.join(root, "config.json");
  const stateDirectory = path.join(root, "pending");
  const original = {
    token: "fake-old-access", refresh_token: "fake-old-refresh", account: "fixture@example.test",
    client_id: "fake-client", client_secret: "fake-secret", token_uri: "https://oauth2.googleapis.com/token",
    scopes: permissions, expiry: "2000-01-01T00:00:00Z", universe_domain: "googleapis.com",
  };
  await writeFile(tokenPath, JSON.stringify(original), { mode: 0o600 });
  await writeFile(clientPath, JSON.stringify({ [type]: {
    client_id: "fake-client", client_secret: "fake-secret", redirect_uris: ["http://localhost"],
  } }), { mode: 0o600 });
  await writeFile(configPath, JSON.stringify({
    google_token_file: tokenPath, document_ids: ["fake-document"], state_directory: root,
  }));
  const replies = {
    tokenStatus: 200,
    token: { access_token: "fake-new-access", refresh_token: "fake-new-refresh", expires_in: 3600,
      token_type: "Bearer", scope: permissions.join(" ") } as Record<string, unknown>,
    email: "fixture@example.test", docStatus: 200,
  };
  const requests: { path: string; method?: string; body: URLSearchParams }[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const pathname = new URL(req.url!, "http://localhost").pathname;
    requests.push({ path: pathname, method: req.method, body: new URLSearchParams(body) });
    res.setHeader("Content-Type", "application/json");
    if (pathname === "/token") {
      res.statusCode = replies.tokenStatus;
      res.end(JSON.stringify(replies.token));
    } else if (pathname === "/gmail/v1/users/me/profile") {
      res.end(JSON.stringify({ emailAddress: replies.email }));
    } else if (pathname === "/v1/documents/fake-document") {
      res.statusCode = replies.docStatus;
      assert.equal(new URL(req.url!, "http://localhost").search, "?fields=documentId");
      res.end(JSON.stringify({ documentId: "fake-document" }));
    } else {
      res.statusCode = 500;
      res.end("{}");
    }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const fakeFetch: typeof fetch = (input, init) => {
    const url = new URL(String(input));
    assert.ok(["oauth2.googleapis.com", "gmail.googleapis.com", "docs.googleapis.com"].includes(url.hostname));
    assert.equal(init?.redirect, "error");
    return fetch(`http://127.0.0.1:${address.port}${url.pathname}${url.search}`, init);
  };
  let now = Date.now();
  const make = () => new GoogleReconnectService({ configPath, stateDirectory, fetch: fakeFetch, now: () => now });
  const service = make();
  const start = async () => {
    const begun = await service.begin(origin, nonce);
    const url = new URL(begun.authorizationUrl);
    const callback = new URL(url.searchParams.get("redirect_uri")!);
    callback.search = new URLSearchParams({ state: url.searchParams.get("state")!, code: "fake/code+with spaces" }).toString();
    return { begun, url, callback, input: { callbackUrl: callback.href, origin, browserNonce: nonce,
      mode: type === "web" ? "redirect" as const : "paste" as const } };
  };
  return { root, tokenPath, clientPath, stateDirectory, original, replies, requests, service, start, make,
    advance: (ms: number) => { now += ms; } };
}

test("PKCE uses independent random verifiers and the S256 base64url challenge", () => {
  const a = createGooglePkce(), b = createGooglePkce();
  assert.match(a.verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a.verifier, b.verifier);
  assert.equal(a.challenge, createHash("sha256").update(a.verifier).digest("base64url"));
});

test("pasted callback requires the exact loopback address, unambiguous state and a code", () => {
  const valid = `${redirect}?state=${nonce}&code=a%2Fb%2Bc`;
  assert.deepEqual(parseGoogleCallback(` ${valid} `, redirect), { state: nonce, code: "a/b+c" });
  for (const invalid of [
    "just-a-code", valid.replace("127.0.0.1", "evil.example"), valid.replace("8767", "8768"),
    valid.replace("/?", "/other?"), valid.replace("127.0.0.1", "user@127.0.0.1"),
    `${valid}#fragment`, `${valid}&code=second`, `${valid}&state=${nonce}`,
    `${redirect}?state=bad&code=x`, `${redirect}?state=${nonce}`, `${valid}%00`,
  ]) assert.throws(() => parseGoogleCallback(invalid, redirect), isError("invalid-callback"));
});

test("desktop consent preserves permissions and persists only private, expiring state", async t => {
  const f = await fixture(t);
  const { begun, url } = await f.start();
  assert.equal(begun.clientType, "desktop");
  assert.equal(begun.redirectUri, undefined);
  for (const [key, expected] of Object.entries({
    response_type: "code", access_type: "offline", prompt: "consent",
    code_challenge_method: "S256", redirect_uri: redirect,
  })) assert.equal(url.searchParams.get(key), expected);
  assert.deepEqual(url.searchParams.get("scope")!.split(" ").sort(), [...permissions].sort());
  assert.equal(url.searchParams.has("client_secret"), false);
  const stateFile = path.join(f.stateDirectory, `${digest(url.searchParams.get("state")!)}.json`);
  const saved = JSON.parse(await readFile(stateFile, "utf8"));
  assert.equal((await stat(stateFile)).mode & 0o777, 0o600);
  assert.equal((await stat(f.stateDirectory)).mode & 0o777, 0o700);
  assert.equal(saved.browserHash, digest(nonce));
  assert.equal(url.searchParams.get("code_challenge"), createHash("sha256").update(saved.verifier).digest("base64url"));
  assert.equal(JSON.stringify(saved).includes("fake-secret"), false);
});

test("successful exchange checks account and doc, atomically backs up token, and survives server restart", async t => {
  const f = await fixture(t);
  const before = await readFile(f.tokenPath, "utf8");
  const { input } = await f.start();
  await f.make().finish(input);
  const token = JSON.parse(await readFile(f.tokenPath, "utf8"));
  assert.equal(token.token, "fake-new-access");
  assert.equal(token.refresh_token, "fake-new-refresh");
  assert.deepEqual(token.scopes, [...permissions].sort());
  assert.equal(token.account, f.original.account);
  assert.equal(token.universe_domain, f.original.universe_domain);
  assert.equal((await stat(f.tokenPath)).mode & 0o777, 0o600);
  const backups = (await readdir(f.root)).filter(name => name.includes(".bak-reconnect-"));
  assert.equal(backups.length, 1);
  assert.equal(await readFile(path.join(f.root, backups[0]), "utf8"), before);
  assert.equal((await stat(path.join(f.root, backups[0]))).mode & 0o777, 0o600);
  assert.deepEqual(f.requests.map(r => [r.method, r.path]), [
    ["POST", "/token"], ["GET", "/gmail/v1/users/me/profile"], ["GET", "/v1/documents/fake-document"],
  ]);
  assert.equal(f.requests[0].body.get("code"), "fake/code+with spaces");
  assert.match(f.requests[0].body.get("code_verifier")!, /^[A-Za-z0-9_-]{43}$/);
  await assert.rejects(f.service.finish(input), isError("expired"));
  assert.equal(f.requests.length, 3);
});

test("state is browser/origin bound and expires at ten minutes", async t => {
  const f = await fixture(t);
  const { input } = await f.start();
  await assert.rejects(f.service.finish({ ...input, browserNonce: "c".repeat(43) }), isError("invalid-callback"));
  await assert.rejects(f.service.finish({ ...input, origin: "https://other.example" }), isError("invalid-callback"));
  f.advance(GOOGLE_RECONNECT_TTL_MS);
  await assert.rejects(f.service.finish(input), isError("expired"));
  assert.equal(f.requests.length, 0);
  assert.deepEqual(JSON.parse(await readFile(f.tokenPath, "utf8")), f.original);
});

test("concurrent callbacks exchange a code exactly once", async t => {
  const f = await fixture(t);
  const { input } = await f.start();
  const outcomes = await Promise.allSettled([f.service.finish(input), f.make().finish(input)]);
  assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(f.requests.filter(r => r.path === "/token").length, 1);
});

test("denied consent consumes state and never contacts the token endpoint", async t => {
  const f = await fixture(t);
  const { input, callback } = await f.start();
  callback.searchParams.delete("code");
  callback.searchParams.set("error", "access_denied");
  await assert.rejects(f.service.finish({ ...input, callbackUrl: callback.href }), isError("consent"));
  await assert.rejects(f.service.finish(input), isError("expired"));
  assert.equal(f.requests.length, 0);
});

test("failed exchange, wrong account, missing/extra scopes and inaccessible doc keep old token", async t => {
  for (const scenario of ["exchange", "account", "missing", "extra", "refresh", "document"]) {
    await t.test(scenario, async t => {
      const f = await fixture(t);
      if (scenario === "exchange") {
        f.replies.tokenStatus = 400;
        f.replies.token = { error: "invalid_grant", error_description: "fake-sensitive-upstream-detail" };
      }
      if (scenario === "account") f.replies.email = "other@example.test";
      if (scenario === "missing") f.replies.token.scope = permissions[0];
      if (scenario === "extra") f.replies.token.scope += " https://www.googleapis.com/auth/drive";
      if (scenario === "refresh") delete f.replies.token.refresh_token;
      if (scenario === "document") f.replies.docStatus = 403;
      const { input } = await f.start();
      await assert.rejects(f.service.finish(input), (error: unknown) => {
        assert.ok(error instanceof GoogleReconnectError);
        assert.doesNotMatch(error.message, /fake-sensitive-upstream-detail|fake-secret|fake-new/);
        return true;
      });
      assert.deepEqual(JSON.parse(await readFile(f.tokenPath, "utf8")), f.original);
      assert.equal((await readdir(f.root)).some(n => n.includes(".bak-reconnect-")), false);
      await assert.rejects(f.service.finish(input), isError("expired"));
    });
  }
});

test("credentials changed during consent cannot be overwritten", async t => {
  const f = await fixture(t);
  const { input } = await f.start();
  await writeFile(f.tokenPath, JSON.stringify({ ...f.original, token: "fake-concurrent-refresh" }));
  await assert.rejects(f.service.finish(input), isError("conflict"));
  assert.equal(f.requests.length, 0);
});

test("a shared token that lost its Docs grant asks for Docs again and keeps every other grant", async t => {
  const f = await fixture(t);
  const current = { ...f.original, scopes: permissions.slice(1), account: "" };
  await writeFile(f.tokenPath, JSON.stringify(current));
  f.replies.tokenStatus = 400;
  f.replies.token = { error: "invalid_grant" };
  assert.equal((await f.service.status(origin)).connection, "needs-reconnect");
  const docsRead = "https://www.googleapis.com/auth/documents.readonly";
  const docsWrite = "https://www.googleapis.com/auth/documents";
  const first = await f.start();
  assert.deepEqual(first.url.searchParams.get("scope")!.split(" ").sort(), [...current.scopes, docsRead, docsWrite].sort());
  // Unticking Docs on Google's consent screen saves nothing.
  f.replies.tokenStatus = 200;
  f.replies.token = { access_token: "fake-new-access", refresh_token: "fake-new-refresh", expires_in: 3600,
    token_type: "Bearer", scope: current.scopes.join(" ") };
  await assert.rejects(f.service.finish(first.input), isError("scopes"));
  assert.deepEqual(JSON.parse(await readFile(f.tokenPath, "utf8")), current);
  // Approving it restores Docs; Google may fold documents.readonly into documents.
  const second = await f.start();
  f.replies.token = { access_token: "fake-new-access", refresh_token: "fake-new-refresh", expires_in: 3600,
    token_type: "Bearer", scope: [...current.scopes, docsWrite].join(" ") };
  await f.service.finish(second.input);
  const saved = JSON.parse(await readFile(f.tokenPath, "utf8"));
  assert.equal(saved.refresh_token, "fake-new-refresh");
  assert.ok(saved.scopes.includes(docsWrite));
  assert.ok(current.scopes.every((scope: string) => saved.scopes.includes(scope)));
});

test("web client is detected and uses the public callback including its port", async t => {
  const f = await fixture(t, "web");
  const { begun, url, input } = await f.start();
  assert.equal(begun.clientType, "web");
  assert.equal(begun.redirectUri, `${origin}/api/google/callback`);
  assert.equal(url.searchParams.get("redirect_uri"), begun.redirectUri);
  await assert.rejects(f.service.finish({ ...input, mode: "paste" }), isError("invalid-callback"));
  await f.service.finish(input);
  assert.equal(f.requests[0].body.get("redirect_uri"), begun.redirectUri);
});

test("read-only status refreshes in memory, caches, and distinguishes revoked access from downtime", async t => {
  const f = await fixture(t);
  const before = await readFile(f.tokenPath, "utf8");
  assert.equal((await f.service.status(origin)).connection, "connected");
  assert.equal((await f.service.status(origin)).connection, "connected");
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[0].body.get("grant_type"), "refresh_token");
  assert.equal(await readFile(f.tokenPath, "utf8"), before);
  assert.equal((await readdir(f.root)).some(n => n.includes("reconnect")), false);
  f.advance(31_000);
  f.replies.tokenStatus = 400;
  f.replies.token = { error: "invalid_grant" };
  assert.equal((await f.service.status(origin)).connection, "needs-reconnect");
  f.advance(31_000);
  f.replies.tokenStatus = 503;
  f.replies.token = {};
  assert.equal((await f.service.status(origin)).connection, "unavailable");
  assert.equal(await readFile(f.tokenPath, "utf8"), before);
});

test("atomic token write preserves symlinks, permissions and exact backup, rejecting stale writes", async t => {
  const f = await fixture(t);
  const alias = path.join(f.root, "google_token.json");
  await symlink(f.tokenPath, alias);
  const before = await readFile(alias, "utf8");
  await writeGoogleToken(alias, f.tokenPath, digest(before), { ...f.original, token: "fake-replaced" });
  assert.equal((await stat(f.tokenPath)).mode & 0o777, 0o600);
  assert.equal(JSON.parse(await readFile(alias, "utf8")).token, "fake-replaced");
  await assert.rejects(writeGoogleToken(alias, f.tokenPath, digest(before), f.original), isError("conflict"));
  assert.equal(JSON.parse(await readFile(alias, "utf8")).token, "fake-replaced");
  assert.equal((await readdir(f.root)).some(n => n.endsWith(".tmp") || n.endsWith(".lock")), false);
});

test("last import reports failed attempts and interrupted workers without returning error details", async t => {
  const f = await fixture(t);
  assert.deepEqual(await f.service.lastImport(), { result: "never", at: null });
  const at = new Date().toISOString();
  await writeFile(path.join(f.root, "state.json"), JSON.stringify({
    lastAttemptAt: at, lastSuccessAt: "2026-09-09T06:00:00Z", errors: ["private detail"], running: false,
  }));
  assert.deepEqual(await f.service.lastImport(), { result: "failed", at });
  await writeFile(path.join(f.root, "state.json"), JSON.stringify({ lastAttemptAt: at, running: true }));
  assert.equal((await f.service.lastImport()).result, "running");
  f.advance(131 * 60_000);
  assert.equal((await f.service.lastImport()).result, "failed");
  await writeFile(path.join(f.root, "state.json"), "invalid JSON");
  assert.deepEqual(await f.service.lastImport(), { result: "unknown", at: null });
});
