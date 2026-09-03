// GET /api/import/image?batch=<id>&n=<index>
// Serves a stored notebook photo. The file name comes from the batch row,
// never from the query string.

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { importBatches } from "@/lib/db/schema";
import { readBatchImage } from "@/lib/import/storage";
import { jsonError } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const batchId = Number(sp.get("batch"));
  const n = Number(sp.get("n"));
  if (!Number.isInteger(batchId) || batchId <= 0 || !Number.isInteger(n) || n < 0) {
    return jsonError("batch and n must be non-negative integers", 400);
  }

  const [batch] = await db
    .select({ imageFiles: importBatches.imageFiles })
    .from(importBatches)
    .where(eq(importBatches.id, batchId))
    .limit(1);
  const fileName = batch?.imageFiles?.[n];
  if (!fileName) return jsonError("Image not found", 404);

  try {
    const { body, contentType } = await readBatchImage(batchId, fileName);
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return jsonError("Image file missing on disk", 404);
  }
}
