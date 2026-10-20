import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest, NextResponse } from "next/server";
import {
  GOOGLE_BROWSER_COOKIE, googleBrowserNonce, googleRequestOrigin, isGoogleSameOriginPost,
  newGoogleBrowserNonce, setGoogleBrowserCookie,
} from "../src/lib/google-reconnect-http";

test("reconnect POST requires the exact public origin behind the HTTPS proxy", () => {
  const make = (origin?: string, extra: Record<string, string> = {}) => new Request("http://localhost:18080/api/google/connect", {
    method: "POST",
    headers: { host: "localhost:18080", "x-forwarded-host": "tutor.example:10000", "x-forwarded-proto": "https",
      ...(origin ? { origin } : {}), ...extra },
  });
  assert.equal(googleRequestOrigin(make()), "https://tutor.example:10000");
  assert.equal(isGoogleSameOriginPost(make("https://tutor.example:10000")), true);
  for (const origin of [undefined, "null", "http://tutor.example:10000", "https://evil.example", "https://tutor.example"]) {
    assert.equal(isGoogleSameOriginPost(make(origin)), false);
  }
  assert.equal(isGoogleSameOriginPost(make("https://tutor.example:10000", { "sec-fetch-site": "cross-site" })), false);
  assert.equal(isGoogleSameOriginPost(make("https://tutor.example:10000", { "sec-fetch-site": "same-site" })), false);
  assert.throws(() => googleRequestOrigin(make(undefined, { "x-forwarded-host": "good.example,evil.example" })));
  assert.throws(() => googleRequestOrigin(make(undefined, { "x-forwarded-host": "good.example@evil.example" })));
  assert.throws(() => googleRequestOrigin(make(undefined, { "x-forwarded-proto": "http" })));
});

test("browser binding uses a private, bounded SameSite cookie", () => {
  const nonce = newGoogleBrowserNonce();
  const response = NextResponse.json({});
  setGoogleBrowserCookie(response, nonce, "https://tutor.example");
  const cookie = response.headers.get("set-cookie")!;
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=lax/i);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Max-Age=600/);
  assert.match(cookie, /Path=\/api\/google/);
  const request = new NextRequest("https://tutor.example/api/google/callback", { headers: { cookie: `${GOOGLE_BROWSER_COOKIE}=${nonce}` } });
  assert.equal(googleBrowserNonce(request), nonce);
  assert.equal(googleBrowserNonce(new NextRequest("https://tutor.example")), null);
  assert.equal(googleBrowserNonce(new NextRequest("https://tutor.example", { headers: { cookie: `${GOOGLE_BROWSER_COOKIE}=bad` } })), null);
});
