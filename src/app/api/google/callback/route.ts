import { NextRequest, NextResponse } from "next/server";
import { finishGoogleReconnect } from "@/lib/google-reconnect";
import { clearGoogleBrowserCookie, googleBrowserNonce, googleRequestOrigin, RECONNECT_HEADERS } from "@/lib/google-reconnect-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let origin: string;
  try { origin = googleRequestOrigin(request); } catch {
    return new NextResponse(null, { status: 400, headers: RECONNECT_HEADERS });
  }
  let connected = false;
  try {
    const browserNonce = googleBrowserNonce(request);
    if (!browserNonce) throw new Error();
    // Reconstruct the public origin: Next receives the proxy's loopback URL.
    const callbackUrl = `${origin}/api/google/callback${request.nextUrl.search}`;
    await finishGoogleReconnect({ callbackUrl, browserNonce, origin, mode: "redirect" });
    connected = true;
  } catch { /* Never log callback URLs, authorization codes or upstream errors. */ }
  const response = NextResponse.redirect(new URL(`/notes?google=${connected ? "connected" : "failed"}`, origin), 303);
  for (const [name, value] of Object.entries(RECONNECT_HEADERS)) response.headers.set(name, value);
  clearGoogleBrowserCookie(response, origin);
  return response;
}
