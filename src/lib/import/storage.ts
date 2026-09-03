// Notebook photo storage. Files live on disk under uploads/<batchId>/ and the
// DB only holds the file names; the image route resolves them server-side so
// a client can never request an arbitrary path.

import { promises as fs } from "node:fs";
import path from "node:path";

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

export function uploadsDir(): string {
  return process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
}

export function batchDir(batchId: number): string {
  return path.join(uploadsDir(), String(batchId));
}

/** Decode a data: URL and write it as uploads/<batchId>/<n>.<ext>. Returns the file name. */
export async function saveDataUrl(
  batchId: number,
  n: number,
  dataUrl: string
): Promise<string> {
  const m = DATA_URL.exec(dataUrl);
  if (!m) throw new Error(`image ${n}: not a jpeg/png/webp data URL`);
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  const name = `${n}.${ext}`;
  await fs.mkdir(batchDir(batchId), { recursive: true });
  await fs.writeFile(path.join(batchDir(batchId), name), Buffer.from(m[2], "base64"));
  return name;
}

export async function readBatchImage(
  batchId: number,
  fileName: string
): Promise<{ body: Buffer; contentType: string }> {
  const safe = path.basename(fileName);
  const body = await fs.readFile(path.join(batchDir(batchId), safe));
  const ext = safe.split(".").pop();
  const contentType =
    ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return { body, contentType };
}

export async function removeBatchFiles(batchId: number): Promise<void> {
  await fs.rm(batchDir(batchId), { recursive: true, force: true });
}
