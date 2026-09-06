import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { importBatches } from "@/lib/db/schema";
import { jsonError, jsonOk } from "@/lib/api";

export const runtime = "nodejs";
const Body = z.object({
  documentId: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/),
  tabId: z.string().max(100), title: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(10_000),
});

// Register before running AI. Repeated deliveries (including a lost HTTP response)
// return the same batch, even after it has been reviewed or discarded.
export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid Google Docs import.", 400);
  const { documentId, tabId, title, text } = parsed.data;
  const key = createHash("sha256").update(JSON.stringify([documentId, tabId, text])).digest("hex");
  const note = `Google Docs: https://docs.google.com/document/d/${documentId}/edit\nImport reference: ${key}`;
  // One SQLite statement atomically checks/inserts, without holding a write
  // transaction across awaits (which would lock out concurrent local requests).
  await db.run(sql`INSERT INTO import_batches (source_kind, raw_text, note, label)
    SELECT 'text', ${text}, ${note}, ${`italki · ${title}`.slice(0, 80)}
    WHERE NOT EXISTS (SELECT 1 FROM import_batches WHERE note = ${note})`);
  const [batch] = await db.select().from(importBatches).where(eq(importBatches.note, note)).limit(1);
  return jsonOk({ batchId: batch.id, status: batch.status, extracted: Boolean(batch.extractedJson) });
}
