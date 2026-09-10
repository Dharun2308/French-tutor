// POST /api/items/review — atomic FSRS scheduling and review evidence.
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { jsonError, jsonOk } from "@/lib/api";
import { ItemReviewBody, recordItemReview, type ItemReviewInput } from "@/lib/items/review";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: ItemReviewInput;
  try {
    body = ItemReviewBody.parse(await req.json());
  } catch (err) {
    return jsonError(`Invalid body: ${err instanceof Error ? err.message : String(err)}`, 400);
  }
  const result = await db.transaction(tx => recordItemReview(tx, body));
  if (!result) return jsonError("Item not found", 404);
  return jsonOk(result);
}
