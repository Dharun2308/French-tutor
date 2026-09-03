import { NextRequest } from "next/server";
import { z } from "zod";
import { changeActiveItem, getActiveItems } from "@/lib/items/active";
import { jsonError, jsonOk } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return jsonOk(await getActiveItems());
}

const PatchBody = z.object({
  action: z.enum(["pin", "unpin", "replace"]),
  itemId: z.number().int().positive(),
});

export async function PATCH(req: NextRequest) {
  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await req.json());
  } catch (err) {
    return jsonError(`Invalid body: ${err instanceof Error ? err.message : String(err)}`, 400);
  }
  try {
    return jsonOk(await changeActiveItem(body.action, body.itemId));
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 409);
  }
}
