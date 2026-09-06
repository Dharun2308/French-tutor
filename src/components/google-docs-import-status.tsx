"use client";
import { useEffect, useState } from "react";

interface Status {
  configured: boolean; running?: boolean; needsAttention?: boolean;
  lastSuccessAt?: string | null; documents: { title: string; url: string }[];
}

export function GoogleDocsImportStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => fetch("/api/import/google-docs/status", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null).then((value) => { if (active) setStatus(value); }).catch(() => {});
    void load();
    const timer = setInterval(load, 30_000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  if (!status?.configured) return null;
  return <section aria-label="Google Docs imports" className="mb-6 rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 text-sm">
    <h2 className="font-semibold">Your italki notes</h2>
    <p className="mt-1 text-muted-foreground">Updates every Wednesday at midnight · Denver time</p>
    <div className="mt-3 space-y-1">{status.documents.map((doc) => <a key={doc.url} href={doc.url} target="_blank" rel="noreferrer" className="block underline underline-offset-2">{doc.title}</a>)}</div>
    <p className="mt-3 text-xs text-muted-foreground">{status.running ? "Preparing your latest notes…" : status.needsAttention ? "The last update needs attention. Saved imports are available below." : status.lastSuccessAt ? `Last updated ${new Date(status.lastSuccessAt).toLocaleString()}. New items are ready for review below.` : "Your first update is being prepared."}</p>
  </section>;
}
