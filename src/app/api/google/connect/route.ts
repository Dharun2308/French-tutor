import { NextRequest, NextResponse } from "next/server";
import { beginGoogleReconnect, finishGoogleReconnect, GoogleReconnectError } from "@/lib/google-reconnect";
import {
  clearGoogleBrowserCookie, googleBrowserNonce, googleRequestOrigin, isGoogleSameOriginPost,
  newGoogleBrowserNonce, RECONNECT_HEADERS, setGoogleBrowserCookie,
} from "@/lib/google-reconnect-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isGoogleSameOriginPost(request)) {
    return NextResponse.json({ error: "Open French Tutor to reconnect Google." }, { status: 403, headers: RECONNECT_HEADERS });
  }
  const origin = googleRequestOrigin(request);
  let body: { address?: string };
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error();
    const text = await request.text();
    if (text.length > 12_000) throw new Error();
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
        Object.keys(parsed).some(key => key !== "address") ||
        ("address" in parsed && (typeof parsed.address !== "string" || !parsed.address.trim()))) throw new Error();
    body = parsed;
  } catch {
    return NextResponse.json({ error: "Paste the full address from Google." }, { status: 400, headers: RECONNECT_HEADERS });
  }
  try {
    if (body.address !== undefined) {
      const browserNonce = googleBrowserNonce(request);
      if (!browserNonce) throw new Error();
      await finishGoogleReconnect({ callbackUrl: body.address, browserNonce, origin, mode: "paste" });
      const response = NextResponse.json({ connected: true }, { headers: RECONNECT_HEADERS });
      clearGoogleBrowserCookie(response, origin);
      return response;
    }
    const nonce = newGoogleBrowserNonce();
    const result = await beginGoogleReconnect(origin, nonce);
    const response = NextResponse.json(result, { headers: RECONNECT_HEADERS });
    setGoogleBrowserCookie(response, nonce, origin);
    return response;
  } catch (error) {
    // Google, filesystem and parser exceptions may contain credential material.
    return NextResponse.json({ error: error instanceof GoogleReconnectError
      ? error.message : "Could not reconnect. Reconnect Google and use the same account." },
      { status: 400, headers: RECONNECT_HEADERS });
  }
}
