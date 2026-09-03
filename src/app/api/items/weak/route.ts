import { NextRequest } from "next/server";
import { rankWeakItems } from "@/lib/items/weak";
import { jsonOk } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const requested = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  const limit = Number.isInteger(requested) ? Math.min(50, Math.max(1, requested)) : 50;
  const items = await rankWeakItems();
  return jsonOk({ items: items.slice(0, limit) });
}
