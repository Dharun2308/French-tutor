import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const GOOGLE_BROWSER_COOKIE = "french_google_reconnect";
export const RECONNECT_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

/** The app's loopback server is reached through the existing trusted tailnet proxy. */
export function googleRequestOrigin(request: Request): string {
  const incoming = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || incoming.host;
  const protocol = request.headers.get("x-forwarded-proto") || incoming.protocol.slice(0, -1);
  if (!["http", "https"].includes(protocol) || /[\s,/@\\?#]/.test(host)) {
    throw new Error("Invalid origin");
  }
  const origin = new URL(`${protocol}://${host}`);
  if (protocol !== "https" && !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) {
    throw new Error("HTTPS required");
  }
  return origin.origin;
}

export function isGoogleSameOriginPost(request: Request): boolean {
  try {
    return request.method === "POST" &&
      request.headers.get("origin") === googleRequestOrigin(request) &&
      !["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") || "");
  } catch {
    return false;
  }
}

export function googleBrowserNonce(request: NextRequest): string | null {
  const nonce = request.cookies.get(GOOGLE_BROWSER_COOKIE)?.value;
  return nonce && /^[A-Za-z0-9_-]{43}$/.test(nonce) ? nonce : null;
}

export function newGoogleBrowserNonce(): string {
  return randomBytes(32).toString("base64url");
}

export function setGoogleBrowserCookie(response: NextResponse, nonce: string, origin: string): void {
  response.cookies.set(GOOGLE_BROWSER_COOKIE, nonce, {
    httpOnly: true,
    secure: origin.startsWith("https:"),
    sameSite: "lax",
    path: "/api/google",
    maxAge: 10 * 60,
  });
}

export function clearGoogleBrowserCookie(response: NextResponse, origin: string): void {
  response.cookies.set(GOOGLE_BROWSER_COOKIE, "", {
    httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax", path: "/api/google", maxAge: 0,
  });
}
