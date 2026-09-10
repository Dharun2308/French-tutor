"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, NotebookPen, Plus, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

type Block = { start: number; text: string; editable: boolean; table: boolean; heading: string;
  runs: { text: string; bold: boolean; italic: boolean; strike: boolean }[] };
type Doc = { id: string; title: string; revision: string; canWrite: boolean;
  tabs: { id: string; title: string; blocks: Block[] }[] };
type Listing = { canWrite: boolean; hasPersonal: boolean; documents: { id: string; label: string }[] };
type Draft = { docId: string; tabId: string; revision: string; start?: number; original: string; text: string };

async function api(id?: string, body?: object) {
  const response = await fetch(`/api/notes${id ? `?id=${encodeURIComponent(id)}` : ""}`, body ? {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  } : { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not reach Google Docs.");
  return result;
}

export default function NotesPage() {
  const [listing, setListing] = useState<Listing | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [selected, setSelected] = useState("");
  const [tabId, setTabId] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const generation = useRef(0);
  const editor = useRef<HTMLTextAreaElement>(null);
  const dirty = Boolean(draft && draft.text !== draft.original);

  useEffect(() => { api().then(setListing).catch(e => setError(e.message)); }, []);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    const navigate = (event: MouseEvent) => {
      if (dirty && (event.target as Element).closest("a[href]") && !window.confirm("Leave this page and discard your unsaved note?")) event.preventDefault();
    };
    window.addEventListener("beforeunload", leave);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", leave); document.removeEventListener("click", navigate, true); };
  }, [dirty]);
  useEffect(() => { editor.current?.focus(); }, [draft?.start, draft?.docId, draft?.tabId]);

  async function load(id: string, keepDraft = false) {
    if (!keepDraft && dirty && !window.confirm("Discard your unsaved note and switch documents?")) return;
    const current = ++generation.current;
    setBusy(true); setError(""); setNotice(""); setSelected(id);
    if (!keepDraft) { setDraft(null); setDoc(null); setQuery(""); }
    try {
      const result: Doc = await api(id);
      if (current !== generation.current) return;
      setDoc(result);
      setTabId(previous => result.tabs.some(t => t.id === previous) ? previous : result.tabs[0]?.id || "");
      if (keepDraft) setNotice("Latest document loaded. Your draft is kept below. Copy it, then cancel and reopen the paragraph to apply it to the latest version.");
    } catch (e) { if (current === generation.current) setError((e as Error).message); }
    finally { if (current === generation.current) setBusy(false); }
  }

  async function create() {
    if (dirty && !window.confirm("Discard your unsaved note and create Personal Notes?")) return;
    setBusy(true); setError("");
    try { const result = await api(undefined, { action: "create" }); setListing(await api()); await load(result.id); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  function begin(block?: Block) {
    if (!doc || (dirty && !window.confirm("Discard your unsaved note?"))) return;
    setError(""); setNotice("");
    setDraft({ docId: doc.id, tabId, revision: doc.revision, start: block?.start, original: block?.text || "", text: block?.text || "" });
  }

  async function save() {
    if (!draft) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api(undefined, { action: draft.start === undefined ? "append" : "edit", id: draft.docId,
        tabId: draft.tabId, revision: draft.revision, start: draft.start, text: draft.text });
      setDraft(null); setNotice("Saved to Google Docs.");
      try { setDoc(await api(draft.docId)); }
      catch { setDoc(null); setNotice("Saved to Google Docs. Reload to see your updated notes."); }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  const tab = doc?.tabs.find(t => t.id === tabId);
  const visible = tab?.blocks.filter(b => !query || b.text.toLocaleLowerCase().includes(query.toLocaleLowerCase())) || [];
  return <main className="container max-w-4xl py-7">
    <header className="mb-5">
      <h1 className="flex items-center gap-2 text-2xl font-semibold"><NotebookPen className="h-6 w-6 text-emerald-600" />Notes</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your lesson notes and personal French, saved in Google Docs.</p>
    </header>
    <div className="mb-5 grid gap-2 sm:grid-cols-3" aria-label="Choose a document">
      {listing?.documents.map(item => <Button key={item.id} variant={selected === item.id ? "secondary" : "outline"}
        disabled={busy} onClick={() => load(item.id)} className="justify-start whitespace-normal text-left h-auto min-h-11">{item.label}</Button>)}
      {listing && !listing.hasPersonal && <Button variant="outline" disabled={busy || !listing.canWrite} onClick={create}><Plus className="h-4 w-4" />Create Personal Notes</Button>}
    </div>
    {listing && !listing.canWrite && <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">Google is connected for reading. Enable Google Docs write access to edit and create Personal Notes.</p>}
    {error && <div role="alert" className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}
      {selected ? <Button variant="outline" size="sm" className="mt-2 block" disabled={busy} onClick={() => load(selected, true)}>Reload document, keep draft</Button>
        : <Button variant="outline" size="sm" className="mt-2 block" onClick={() => { setError(""); api().then(setListing).catch(e => setError(e.message)); }}>Retry connection</Button>}
    </div>}
    {notice && <p role="status" className="mb-4 rounded-lg bg-emerald-500/10 p-3 text-sm">{notice}</p>}
    {busy && <p role="status" className="mb-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{draft ? "Saving…" : "Connecting to Google Docs…"}</p>}
    {!doc && !busy && !error && !selected && <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Choose a document to start writing.</p>}
    {selected && !doc && !busy && !error && <Button variant="outline" onClick={() => load(selected)}>Reload document</Button>}
    {doc && <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="min-w-0 break-words text-lg font-semibold">{doc.title}</h2>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => load(doc.id, Boolean(draft))}><RefreshCw className="h-4 w-4" />Reload</Button>
          <Button asChild variant="ghost" size="sm"><a href={`https://docs.google.com/document/d/${doc.id}/edit`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" />Google Docs</a></Button>
        </div>
      </div>
      {doc.tabs.length > 1 && <select aria-label="Document tab" className="mb-3 w-full rounded-md border bg-background p-2" value={tabId} disabled={busy}
        onChange={event => { if (!dirty || window.confirm("Discard your unsaved note and switch tabs?")) { setTabId(event.target.value); setDraft(null); } }}>
        {doc.tabs.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
      </select>}
      <div className="mb-4 flex gap-2">
        <input aria-label="Find in notes" placeholder="Find in notes…" value={query} onChange={e => setQuery(e.target.value)} className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm" />
        <Button disabled={busy || !doc.canWrite} onClick={() => begin()}><Plus className="h-4 w-4" />Add note</Button>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">Edit text a paragraph at a time. Unchanged text keeps its formatting; new text uses surrounding formatting. Images, comments and layout tools are available in Google Docs.</p>
    </>}
    {draft && <section className="mb-5 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4" aria-label="Note editor">
      <label htmlFor="note-draft" className="mb-2 block font-medium">{draft.start === undefined ? "New note" : "Edit paragraph"}</label>
      <textarea id="note-draft" ref={editor} value={draft.text} maxLength={10000} disabled={busy} rows={8}
        onChange={e => setDraft({ ...draft, text: e.target.value })} className="w-full resize-y rounded-md border bg-background p-3 text-base leading-relaxed" />
      {draft.start !== undefined && <details className="mt-2 text-sm text-muted-foreground"><summary className="cursor-pointer">Original paragraph</summary><p className="mt-2 whitespace-pre-wrap break-words">{draft.original}</p></details>}
      {doc && draft.revision !== doc.revision && <p className="mt-2 text-sm">This draft belongs to an older version. Copy your text, then cancel and reopen the paragraph from the latest document.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button disabled={busy || !dirty || Boolean(doc && draft.revision !== doc.revision) || (draft.start === undefined && !draft.text.trim())} onClick={save}><Save className="h-4 w-4" />Save to Google Docs</Button>
        <Button variant="outline" disabled={busy} onClick={() => { if (!dirty || window.confirm("Discard your unsaved note?")) setDraft(null); }}>Cancel</Button>
      </div>
    </section>}
    {doc && <section className="rounded-xl border bg-card p-3 sm:p-5" aria-label="Document text">
      {visible.length === 0 && <p className="p-3 text-sm text-muted-foreground">{query ? "No matching paragraphs." : "No text yet. Add your first note above."}</p>}
      {visible.map(block => <div key={block.start} className={`group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 ${block.table ? "ml-2 border-l-2 border-muted" : ""}`}>
        <div className={`min-w-0 flex-1 whitespace-pre-wrap break-words leading-relaxed ${block.heading.startsWith("HEADING") || block.heading === "TITLE" ? "font-semibold" : ""}`}>
          {block.runs.map((run, index) => <span key={index} className={`${run.bold ? "font-bold" : ""} ${run.italic ? "italic" : ""} ${run.strike ? "line-through" : ""}`}>{run.text}</span>)}
          {!block.editable && <span className="text-xs text-muted-foreground"> · Edit this element in Google Docs</span>}
        </div>
        {block.editable && doc.canWrite && <button aria-label={`Edit paragraph ${block.start}`} disabled={busy} onClick={() => { begin(block); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="shrink-0 rounded px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400">Edit</button>}
      </div>)}
    </section>}
  </main>;
}
