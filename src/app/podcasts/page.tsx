"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardPaste, FileText, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatClock, type Language } from "@/lib/podcasts/model";

interface EpisodeRow { id: string; title: string; published: string | null; duration: number | null; status: "ready" | "working" | null; position: { seconds: number; done: boolean } | null }
interface ShowRow { id: string; title: string; image: string | null; language: Language; added: boolean; episodes: EpisodeRow[] }
interface Preview {
  show: { title: string; feed: string; image: string | null; language: Language; languageKnown: boolean; existingId: string | null; episodes: number };
  episode: { id: string; title: string; published: string | null; duration: number | null } | null;
  episodeMissing: string | null;
}

const SHOW_KEY = "podcast-show";
const PAGE = 100;
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

async function api<T>(body?: object): Promise<T> {
  const r = await fetch("/api/podcasts", body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? "Something went wrong");
  return d as T;
}

function AddLink({ onAdded }: { onAdded: (showId: string, episodeId: string | null) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"find" | "add" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [language, setLanguage] = useState<Language>("en");

  const find = async (text: string) => {
    if (!text.trim()) return;
    setBusy("find");
    setError(null);
    setPreview(null);
    try {
      const found = await api<Preview>({ action: "resolve", url: text });
      setPreview(found);
      setLanguage(found.show.language);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  // An empty box pastes from the clipboard in one tap.
  const pasteOrFind = async () => {
    if (url.trim()) return find(url);
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      await find(text);
    } catch {
      setError("Long-press the box and paste the link.");
    }
  };

  const add = async () => {
    if (!preview) return;
    setBusy("add");
    setError(null);
    try {
      const id = preview.show.existingId ?? (await api<{ id: string }>({ action: "add", feed: preview.show.feed, language })).id;
      onAdded(id, preview.episode?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  const close = () => { setPreview(null); setUrl(""); setError(null); };

  return (
    <div className="mb-5">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void pasteOrFind(); }}>
        <input
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setPreview(null); setError(null); }}
          placeholder="Paste a Spotify or podcast link"
          aria-label="Podcast link"
          className="h-11 min-w-0 flex-1 rounded-lg border bg-background px-3 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        />
        <Button type="submit" className="h-11 shrink-0" disabled={busy !== null}>
          {busy === "find" ? <Loader2 className="h-4 w-4 animate-spin" /> : url.trim() ? "Find" : <><ClipboardPaste className="h-4 w-4" />Paste</>}
        </Button>
      </form>
      {busy === "find" && <p className="mt-2 text-xs text-muted-foreground">Looking up the show…</p>}
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      {preview && (
        <div className="relative mt-3 rounded-xl border p-3">
          <button type="button" onClick={close} aria-label="Close" className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
          <div className="flex items-center gap-3 pr-8">
            {preview.show.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.show.image} alt="" width={56} height={56} className="h-14 w-14 shrink-0 rounded-lg object-cover" />
            )}
            <div className="min-w-0">
              <p className="font-semibold leading-snug">{preview.show.title}</p>
              <p className="text-xs text-muted-foreground">{preview.show.episodes} episodes{preview.show.existingId ? " · already in your list" : ""}</p>
            </div>
          </div>
          {preview.episode && (
            <p className="mt-3 text-sm"><span className="text-muted-foreground">Episode: </span><span className="font-medium">{preview.episode.title}</span></p>
          )}
          {preview.episodeMissing && (
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">“{preview.episodeMissing}” isn’t in the show’s public feed (it may be Spotify-only or too old). You can still add the show.</p>
          )}
          {!preview.show.existingId && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs text-muted-foreground">{preview.show.languageKnown ? "Spoken in" : "Which language is it in?"}</p>
              <div role="radiogroup" aria-label="Spoken language" className="flex gap-1 rounded-lg bg-muted p-1">
                {(["fr", "en"] as const).map((code) => (
                  <button key={code} type="button" role="radio" aria-checked={language === code} onClick={() => setLanguage(code)}
                    className={cn("flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors", language === code ? "bg-background shadow-sm" : "text-muted-foreground")}>
                    {code === "fr" ? "French" : "English → French"}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Button className="mt-3 h-11 w-full" onClick={add} disabled={busy !== null}>
            {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : preview.episode ? "Open episode" : preview.show.existingId ? "Open show" : <><Plus className="h-4 w-4" />Add show</>}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function PodcastsPage() {
  const router = useRouter();
  const [shows, setShows] = useState<ShowRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    try { setSelected(localStorage.getItem(SHOW_KEY)); } catch { /* first show */ }
  }, []);
  const choose = (id: string) => {
    setSelected(id);
    setLimit(PAGE);
    try { localStorage.setItem(SHOW_KEY, id); } catch { /* still switches */ }
  };
  const visible = shows?.find((show) => show.id === selected) ?? shows?.[0];

  const load = () => api<{ shows: ShowRow[] }>()
    .then((d) => { setShows(d.shows); setError(null); })
    .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  useEffect(() => { void load(); }, []);

  const added = (showId: string, episodeId: string | null) => {
    choose(showId);
    if (episodeId) router.push(`/podcasts/${showId}/${episodeId}`);
    else void load();
  };

  const remove = async (show: ShowRow) => {
    if (!confirm(`Remove ${show.title} from Podcasts?`)) return;
    try {
      await api({ action: "remove", id: show.id });
      choose(shows?.[0]?.id ?? "");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <main className="container max-w-2xl py-6">
      <h1 className="mb-4 text-2xl font-semibold">Podcasts</h1>
      <AddLink onAdded={added} />
      {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
      {!shows && !error && <div className="h-64 animate-pulse rounded-xl bg-muted" />}
      {shows && shows.length > 1 && (
        <div role="tablist" aria-label="Shows" className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {shows.map((show) => (
            <button
              key={show.id}
              type="button"
              role="tab"
              aria-selected={show.id === visible?.id}
              onClick={() => choose(show.id)}
              className={cn("max-w-[14rem] shrink-0 truncate rounded-full border px-3.5 py-2 text-sm font-medium transition-colors", show.id === visible?.id ? "border-transparent bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}
            >{show.title}</button>
          ))}
        </div>
      )}
      {visible && [visible].map((show) => (
        <section key={show.id} aria-label={show.title} className="mb-8">
          <div className="mb-3 flex items-center gap-3">
            {show.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={show.image} alt="" width={56} height={56} className="h-14 w-14 rounded-lg object-cover" />
            )}
            <div className="min-w-0">
              <h2 className="font-semibold">{show.title}</h2>
              <p className="text-xs text-muted-foreground">{show.episodes.length} episodes{show.language === "en" ? " · English, with French subtitles" : ""}</p>
            </div>
          </div>
          <ul className="divide-y rounded-xl border">
            {show.episodes.slice(0, limit).map((episode) => (
              <li key={episode.id}>
                <Link href={`/podcasts/${show.id}/${episode.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-snug" lang={show.language}>{episode.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {[episode.published && dateFormat.format(new Date(episode.published)), episode.duration && formatClock(episode.duration)].filter(Boolean).join(" · ")}
                      {episode.position && !episode.position.done && episode.position.seconds >= 5 && (
                        <span className="text-blue-700 dark:text-blue-300"> · Resume at {formatClock(episode.position.seconds)}</span>
                      )}
                      {episode.position?.done && <span> · Listened</span>}
                    </span>
                  </span>
                  {episode.status === "ready" && <FileText aria-label="Transcript ready" className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />}
                  {episode.status === "working" && <Loader2 aria-label="Transcribing" className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
                </Link>
              </li>
            ))}
          </ul>
          {show.episodes.length > limit && (
            <Button variant="outline" className="mt-3 w-full" onClick={() => setLimit(limit + PAGE)}>Show more ({show.episodes.length - limit} left)</Button>
          )}
          {show.added && (
            <button type="button" onClick={() => void remove(show)} className="mt-4 block w-full py-2 text-center text-xs text-muted-foreground underline-offset-2 hover:underline">Remove this show</button>
          )}
        </section>
      ))}
    </main>
  );
}
