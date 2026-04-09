// POST /api/cards/suspend — toggle a card's suspended state.
// Used from the library page to pause/unpause specific conjugations.

import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { cards } from "@/lib/db/schema";
import { jsonError, jsonOk } from "@/lib/api";

export const runtime = "nodejs";

const Body = z.object({
  cardId: z.number().int().positive(),
  suspended: z.boolean(),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return jsonError(
      `Invalid body: ${err instanceof Error ? err.message : String(err)}`,
      400
    );
  }
  await db
    .update(cards)
    .set({ suspended: body.suspended })
    .where(eq(cards.id, body.cardId));
  return jsonOk({ ok: true });
}
