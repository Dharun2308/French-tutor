import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/notes/route";

async function request(origin?: string, body = '{"action":"create"}', extra: Record<string, string> = {}) {
  return POST(new NextRequest("http://127.0.0.1:8095/api/notes", {
    method: "POST", headers: { host: "127.0.0.1:8095", ...(origin ? { origin } : {}), ...extra }, body,
  }));
}

async function main() {
  // These requests must be rejected before the bridge can access credentials or Google.
  assert.equal((await request()).status, 403);
  assert.equal((await request("https://another-site.example")).status, 403);
  assert.equal((await request("invalid origin")).status, 403);
  assert.equal((await request("http://127.0.0.1:8095", undefined, { "sec-fetch-site": "cross-site" })).status, 403);
  assert.equal((await request("http://127.0.0.1:8095", "not JSON")).status, 400);
  assert.equal((await request("http://127.0.0.1:8095", '{"action":"delete"}')).status, 400);
  assert.equal((await request("http://127.0.0.1:8095", "x".repeat(70001))).status, 413);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
