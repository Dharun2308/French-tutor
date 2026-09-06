import { execFile } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const input = z.object({
  action: z.enum(["create", "edit", "append"]),
  id: z.string().regex(/^[\w-]{20,150}$/).optional(),
  tabId: z.string().max(150).optional(),
  revision: z.string().min(1).max(300).optional(),
  start: z.number().int().positive().optional(),
  text: z.string().max(10000).optional(),
});

async function bridge(body: Record<string, unknown>) {
  try {
    const output = await new Promise<string>((resolve, reject) => {
      const child = execFile(path.join(homedir(), ".hermes/hermes-agent/venv/bin/python"),
        [path.join(process.cwd(), "scripts/google-docs-editor.py")],
        { timeout: 110_000, maxBuffer: 4 * 1024 * 1024 },
        (error, stdout) => error ? reject(new Error("Editor connection failed")) : resolve(stdout));
      child.stdin?.on("error", () => {});
      child.stdin?.end(JSON.stringify(body));
    });
    const result = JSON.parse(output);
    const status = result.error ? result.status || 502 : 200;
    delete result.status;
    return NextResponse.json(result, { status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Google Docs did not respond. Keep your draft and reload the document to check whether the save went through." }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  return bridge(id ? { action: "get", id } : { action: "list" });
}

export async function POST(request: NextRequest) {
  // Writes must originate in this app, including when accessed through the phone proxy.
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  let sameHost = false;
  try { sameHost = Boolean(origin && host && new URL(origin).host === host); } catch { /* Invalid origin. */ }
  if (!sameHost || request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Open the editor in French Tutor to save notes." }, { status: 403 });
  }
  const raw = await request.text();
  if (raw.length > 70000) return NextResponse.json({ error: "Note is too long." }, { status: 413 });
  let parsed;
  try { parsed = input.safeParse(JSON.parse(raw)); } catch { return NextResponse.json({ error: "Invalid note." }, { status: 400 }); }
  if (!parsed.success) return NextResponse.json({ error: "Invalid note." }, { status: 400 });
  return bridge(parsed.data);
}
