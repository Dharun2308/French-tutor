"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Loader2 } from "lucide-react";
import { formatClock } from "@/lib/podcasts/model";

interface EpisodeRow { id: string; title: string; published: string | null; duration: number | null; status: "ready" | "working" | null }
interface ShowRow { id: string; title: string; image: string | null; episodes: EpisodeRow[] }

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function PodcastsPage() {
  const [shows, setShows] = useState<ShowRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/podcasts", { cache: "no-store" })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; })
      .then((d) => setShows(d.shows))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <main className="container max-w-2xl py-6">
      <h1 className="mb-5 text-2xl font-semibold">Podcasts</h1>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!shows && !error && <div className="h-64 animate-pulse rounded-xl bg-muted" />}
      {shows?.map((show) => (
        <section key={show.id} aria-label={show.title} className="mb-8">
          <div className="mb-3 flex items-center gap-3">
            {show.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={show.image} alt="" width={56} height={56} className="h-14 w-14 rounded-lg object-cover" />
            )}
            <div>
              <h2 className="font-semibold">{show.title}</h2>
              <p className="text-xs text-muted-foreground">{show.episodes.length} episodes</p>
            </div>
          </div>
          <ul className="divide-y rounded-xl border">
            {show.episodes.map((episode) => (
              <li key={episode.id}>
                <Link href={`/podcasts/${show.id}/${episode.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-snug" lang="fr">{episode.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {[episode.published && dateFormat.format(new Date(episode.published)), episode.duration && formatClock(episode.duration)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {episode.status === "ready" && <FileText aria-label="Transcript ready" className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />}
                  {episode.status === "working" && <Loader2 aria-label="Transcribing" className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
