import { NextRequest, NextResponse } from "next/server";
import { allowsRequestOrigin } from "@/lib/request-origin";

export function middleware(request: NextRequest) {
  if (!allowsRequestOrigin(request)) {
    return NextResponse.json({ error: "Open French Tutor to make changes." }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
