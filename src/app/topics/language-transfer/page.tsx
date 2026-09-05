"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Headphones, RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { audioTime, EMPTY_LIBRARY, FRENCH_LESSONS, LT_STORAGE_KEY, PLAYBACK_SPEEDS, readListeningLibrary, type ListeningLibrary, type ListeningProgress } from "@/lib/language-transfer";

function LessonPlayer({ lesson, progress, speed, onProgress, onSpeed }: {
  lesson: typeof FRENCH_LESSONS[number]; progress?: ListeningProgress; speed: number;
  onProgress: (position: number, completed: boolean) => void; onSpeed: (value: number) => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const initialPosition = useRef(progress?.completed ? 0 : progress?.position ?? 0);
  const completed = useRef(progress?.completed ?? false);
  const lastSaved = useRef(0);
  const saveCallback = useRef(onProgress);
  saveCallback.current = onProgress;
  const [error, setError] = useState(false);
  const save = () => {
    const player = audio.current;
    if (player && player.readyState > 0) saveCallback.current(player.currentTime, completed.current);
  };
  const seek = (offset: number) => {
    const player = audio.current;
    if (!player || !Number.isFinite(player.duration)) return;
    player.currentTime = Math.max(0, Math.min(player.duration, player.currentTime + offset));
    save();
  };
  useEffect(() => { if (audio.current) audio.current.playbackRate = speed; }, [speed]);
  useEffect(() => {
    const player = audio.current;
    const flush = () => { if (player && player.readyState > 0) saveCallback.current(player.currentTime, completed.current); };
    const visibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", visibility);
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: `French · Lesson ${lesson.number}`, artist: "Language Transfer", album: "Introduction to French" });
      navigator.mediaSession.setActionHandler("play", () => { void player?.play().catch(() => setError(true)); });
      navigator.mediaSession.setActionHandler("pause", () => player?.pause());
      navigator.mediaSession.setActionHandler("seekbackward", () => seek(-15));
      navigator.mediaSession.setActionHandler("seekforward", () => seek(15));
    }
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", visibility);
      if ("mediaSession" in navigator) {
        for (const action of ["play", "pause", "seekbackward", "seekforward"] as const) navigator.mediaSession.setActionHandler(action, null);
        navigator.mediaSession.metadata = null;
      }
    };
    // Each lesson mounts a new player; latest callbacks are kept in a ref for cleanup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.number]);
  return <div className="space-y-4">
    <audio ref={audio} className="w-full" controls preload="metadata" aria-label={`French lesson ${lesson.number}`} src={`/api/language-transfer/${lesson.number}`}
      onLoadedMetadata={() => { const player = audio.current!; player.currentTime = Math.min(initialPosition.current, player.duration); player.playbackRate = speed; setError(false); }}
      onTimeUpdate={() => { if (Date.now() - lastSaved.current > 5000) { lastSaved.current = Date.now(); save(); } }}
      onPause={save} onSeeked={save} onEnded={() => { completed.current = true; save(); }} onError={() => setError(true)} />
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => seek(-15)} aria-label="Back 15 seconds"><RotateCcw className="h-4 w-4" />15s</Button>
      <Button variant="outline" size="sm" onClick={() => seek(15)} aria-label="Forward 15 seconds">15s<RotateCw className="h-4 w-4" /></Button>
      <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">Speed<select aria-label="Playback speed" className="rounded-md border bg-background p-2 text-sm text-foreground" value={speed} onChange={(e) => onSpeed(Number(e.target.value))}>{PLAYBACK_SPEEDS.map((rate) => <option key={rate} value={rate}>{rate}×</option>)}</select></label>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">Couldn’t load this lesson. <button className="underline" onClick={() => { setError(false); audio.current?.load(); }}>Try again</button>.</p>}
    <p className="text-xs text-muted-foreground">Pause and try each answer aloud before continuing.</p>
  </div>;
}

export default function LanguageTransferPage() {
  const [library, setLibrary] = useState<ListeningLibrary>(EMPTY_LIBRARY);
  const latest = useRef(EMPTY_LIBRARY);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    let restored = EMPTY_LIBRARY;
    try { restored = readListeningLibrary(localStorage.getItem(LT_STORAGE_KEY)); } catch { setStorageError(true); }
    latest.current = restored; setLibrary(restored); setLoaded(true);
  }, []);
  const save = (next: ListeningLibrary) => {
    latest.current = next; setLibrary(next);
    try { localStorage.setItem(LT_STORAGE_KEY, JSON.stringify(next)); } catch { setStorageError(true); }
  };
  const select = (number: number) => save({ ...latest.current, selected: number });
  const update = (number: number, position: number, completed: boolean) => save({ ...latest.current,
    tracks: { ...latest.current.tracks, [number]: { position, completed } } });
  const lesson = FRENCH_LESSONS[library.selected - 1];
  const listened = Object.values(library.tracks).filter((track) => track.completed).length;
  return <main className="container max-w-3xl py-7">
    <Link href="/topics" className="mb-5 inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Topics</Link>
    <div className="mb-5 flex items-start gap-3"><div className="rounded-xl bg-blue-500/10 p-3"><Headphones className="h-6 w-6 text-blue-600 dark:text-blue-400" /></div><div><h1 className="text-2xl font-semibold">Language Transfer</h1><p className="mt-1 text-sm text-muted-foreground">Introduction to French · 40 audio lessons</p></div></div>
    {!loaded ? <div className="h-56 animate-pulse rounded-xl bg-muted" /> : <>
      <section aria-label="Lesson player" className="mb-6 rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Now listening</p><h2 className="mt-1 text-lg font-semibold">Lesson {lesson.number}</h2></div><span className="text-sm text-muted-foreground">{audioTime(lesson.duration)}</span></div>
        <LessonPlayer key={lesson.number} lesson={lesson} progress={library.tracks[lesson.number]} speed={library.speed} onProgress={(position, completed) => update(lesson.number, position, completed)} onSpeed={(speed) => save({ ...latest.current, speed })} />
        <div className="mt-4 flex justify-between gap-2 border-t pt-4"><Button variant="ghost" size="sm" disabled={lesson.number === 1} onClick={() => select(lesson.number - 1)}><ArrowLeft className="h-4 w-4" />Previous</Button><Button variant="outline" size="sm" disabled={lesson.number === 40} onClick={() => select(lesson.number + 1)}>Next lesson<ArrowRight className="h-4 w-4" /></Button></div>
      </section>
      <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">All lessons</h2><span className="text-xs text-muted-foreground">{listened}/40 listened</span></div>
      <div className="mb-4 grid gap-2 sm:grid-cols-2">{FRENCH_LESSONS.map((track) => {
        const progress = library.tracks[track.number];
        const active = track.number === lesson.number;
        return <button key={track.number} onClick={() => select(track.number)} aria-current={active ? "true" : undefined} className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${active ? "border-blue-500/50 bg-blue-500/5" : ""}`}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs">{progress?.completed ? <Check aria-label="Listened" className="h-4 w-4 text-emerald-600" /> : String(track.number).padStart(2, "0")}</span>
          <span className="flex-1"><span className="block text-sm font-medium">Lesson {track.number}</span><span className="block text-xs text-muted-foreground">{progress?.completed ? "Listened" : progress?.position ? `Resume at ${audioTime(progress.position)}` : audioTime(track.duration)}</span></span>
          {active && <Headphones className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
        </button>;
      })}</div>
      <p className="text-xs text-muted-foreground">{storageError ? "Your browser couldn’t save listening progress. Audio still works." : "Your place is saved in this browser. Listening progress is separate from topic practice."}</p>
    </>}
    <p className="mt-5 text-xs leading-relaxed text-muted-foreground">Audio by <a href="https://www.languagetransfer.org/french" target="_blank" rel="noreferrer" className="underline">Language Transfer</a>, from their official free French course. <a href="https://www.languagetransfer.org/donations" target="_blank" rel="noreferrer" className="underline">Support the project</a>.</p>
  </main>;
}
