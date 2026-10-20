import { NextRequest, NextResponse } from "next/server";
import { getGoogleConnectionStatus, getGoogleLastImport } from "@/lib/google-reconnect";
import { googleRequestOrigin, RECONNECT_HEADERS } from "@/lib/google-reconnect-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const origin = googleRequestOrigin(request);
    const [connection, lastImport] = await Promise.all([
      getGoogleConnectionStatus(origin), getGoogleLastImport(),
    ]);
    return NextResponse.json({ ...connection, lastImport }, { headers: RECONNECT_HEADERS });
  } catch {
    return NextResponse.json({
      connection: "unavailable", clientType: null, lastImport: { result: "unknown", at: null },
    }, { headers: RECONNECT_HEADERS });
  }
}
