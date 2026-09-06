import { readFile } from "node:fs/promises";
import path from "node:path";
import { jsonOk } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = JSON.parse(await readFile(path.join(process.cwd(), ".google-docs-sync/state.json"), "utf8"));
    const interrupted = state.running && Date.now() - Date.parse(state.lastAttemptAt) > 130 * 60_000;
    return jsonOk({ configured: true, running: Boolean(state.running && !interrupted),
      lastSuccessAt: state.lastSuccessAt ?? null, lastAttemptAt: state.lastAttemptAt,
      needsAttention: interrupted || Boolean(state.errors?.length), pending: state.pending?.length ?? 0,
      documents: Object.entries(state.documents ?? {}).map(([id, document]) => ({
        title: (document as { title: string }).title, url: `https://docs.google.com/document/d/${id}/edit`,
      })),
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return jsonOk({ configured: false });
    return jsonOk({ configured: true, needsAttention: true, documents: [] });
  }
}
