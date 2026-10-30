"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, LocateFixed, Loader2, Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatClock, lineAt, type Line } from "@/lib/podcasts/model";

type Stage = "idle" | "queued" | "downloading" | "transcribing" | "ready" | "failed";
interface Data {
  show: { id: string; title: string; language: "fr" | "en" };
  episode: { id: string; title: string; duration: number | null };
  stage: Stage;
  progress: number;
  error: string | null;
  audioReady: boolean;
  translating: boolean;
  translateError: string | null;
  lines: Line[] | null;
  en: Record<number, string> | null;
  position: { seconds: number; done: boolean } | null;
}

const SPEEDS = [0.75, 0.85, 1, 1.25];
const PREFS_KEY = "podcast-prefs";

/** `english`: English of French shows (off by default); `original`: what English shows say, under the French (on by default). */
interface Prefs { speed: number; english: boolean; original: boolean }

function readPrefs(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    return { speed: SPEEDS.includes(saved.speed) ? saved.speed : 1, english: saved.english === true, original: saved.original !== false };
  } catch {
    return { speed: 1, english: false, original: true };
  }
}

const Row = memo(function Row({ index, line, en, active, past, onSelect }: {
  index: number; line: Line; en: string | null; active: boolean; past: boolean; onSelect: (index: number) => void;
}) {
  // English shows: French translation on top; until it arrives, what is said, greyed.
  const main = line.pending ? line.source ?? "" : line.fr;
  return (
    <button
      type="button"
      data-line={index}
      aria-current={active ? "true" : undefined}
      onClick={() => onSelect(index)}
      className={cn(
        "flex w-full gap-3 rounded-lg border-l-2 px-3 py-2.5 text-left transition-colors",
        active ? "border-blue-500 bg-blue-500/10" : "border-transparent hover:bg-muted/50",
      )}
    >
      <span className="w-10 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">{formatClock(line.start)}</span>
      <span className="min-w-0 flex-1">
        <span lang={line.pending ? "en" : "fr"} className={cn("block text-[17px] leading-relaxed", (line.pending || (past && !active)) && "text-muted-foreground", line.pending && "italic")}>{main}</span>
        {en !== null && !line.pending && <span lang="en" className="mt-0.5 block text-sm leading-snug text-muted-foreground">{en || "…"}</span>}
      </span>
    </button>
  );
});

const AdRow = memo(function AdRow({ from, start, end, active, onSkip }: {
  from: number; start: number; end: number; active: boolean; onSkip: (from: number) => void;
}) {
  return (
    <button
      type="button"
      data-line={from}
      aria-current={active ? "true" : undefined}
      onClick={() => onSkip(from)}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-left text-sm text-muted-foreground transition-colors",
        active ? "border-blue-500 bg-blue-500/10" : "border-transparent hover:bg-muted/50",
      )}
    >
      <span className="w-10 shrink-0 text-xs tabular-nums">{formatClock(start)}</span>
      <span className="flex-1">Ad · {formatClock(end - start)}</span>
      <span className="inline-flex items-center gap-1 text-xs font-medium">Skip<SkipForward className="h-3.5 w-3.5" /></span>
    </button>
  );
});

type Block = { kind: "line"; index: number } | { kind: "ad"; from: number; to: number };

export default function PodcastEpisodePage() {
  const params = useParams<{ show: string; episode: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [following, setFollowing] = useState(true);
  const audio = useRef<HTMLAudioElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const programmaticUntil = useRef(0);
  const lastSaved = useRef(0);
  // Saved listening position, applied once the audio can seek (iPhone loads nothing until play).
  const pending = useRef<number | null>(null);
  const restored = useRef(false);
  const lastTime = useRef(0);
  const listened = useRef(false);
  const started = useRef(false);
  const translateAsked = useRef(false);
  // English shows: the line the French translation was last asked to start from.
  const frenchAskedFrom = useRef<number | null>(null);

  const lines = data?.lines ?? null;
  const active = lines ? lineAt(lines, time) : -1;
  const englishShow = data?.show.language === "en";
  // French shows ask for English on demand; English shows always carry their source text.
  const english = englishShow ? false : prefs?.english ?? false;
  const subtitle = englishShow ? prefs?.original ?? true : english;
  const base = `/api/podcasts/${params.show}/${params.episode}`;

  useEffect(() => setPrefs(readPrefs()), []);
  const savePrefs = (next: Prefs) => {
    setPrefs(next);
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* playback still works */ }
  };

  const load = useCallback(async () => {
    const r = await fetch(`${base}${english ? "?en=1" : ""}`, { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error ?? "Couldn't load this episode");
    setData(d);
    if (!restored.current) {
      restored.current = true;
      const saved = d.position && !d.position.done ? d.position.seconds : 0;
      if (saved > 0) {
        pending.current = saved;
        lastTime.current = saved;
        setTime(saved);
      }
    }
    return d as Data;
  }, [base, english]);

  const post = useCallback(async (body: object) => {
    await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
  }, [base]);

  // First visit starts the transcription; then poll until lines (and English, when on) are in.
  useEffect(() => {
    if (!prefs) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const d = await load();
        if (stopped) return;
        setLoadError(null);
        if (!started.current && d.stage !== "ready") {
          started.current = true;
          await post({ action: "transcribe" });
        }
        const working = d.stage === "queued" || d.stage === "downloading" || d.stage === "transcribing" || (d.stage === "idle" && started.current);
        const englishMissing = english && d.lines && d.en && !d.translateError && d.lines.some((_, i) => !(i in d.en!));
        const frenchMissing = d.show.language === "en" && d.lines && !d.translateError && d.lines.some((line) => line.pending);
        if (working || englishMissing || frenchMissing) timer = setTimeout(tick, working ? 2000 : 4000);
      } catch (e) {
        if (stopped) return;
        setLoadError(e instanceof Error ? e.message : String(e));
        timer = setTimeout(tick, 5000);
      }
    };
    void tick();
    return () => { stopped = true; clearTimeout(timer); };
  }, [load, post, prefs, english, data?.stage, data?.translating]);

  // English is generated the first time it is switched on, starting at the line being played.
  useEffect(() => {
    if (!english || !lines || translateAsked.current) return;
    translateAsked.current = true;
    void post({ action: "translate", from: Math.max(0, active) }).then(() => load().catch(() => {}));
  }, [english, lines, active, post, load]);

  // English shows are translated into French as soon as the transcript exists. The
  // server starts this itself; asking again resumes after a restart and, after a
  // jump into lines not yet translated, moves the translation to where you are.
  const activePending = lines?.[Math.max(0, active)]?.pending ?? false;
  const askFrench = useCallback((from: number) => {
    frenchAskedFrom.current = from;
    void post({ action: "translate", from }).then(() => load().catch(() => {}));
  }, [post, load]);
  useEffect(() => {
    if (!englishShow || !lines || data?.translateError) return;
    const from = Math.max(0, active);
    const asked = frenchAskedFrom.current;
    if (asked === null ? lines.some((line) => line.pending) && !data?.translating : activePending && Math.abs(from - asked) > 20) askFrench(from);
  }, [englishShow, lines, active, activePending, data?.translating, data?.translateError, askFrench]);

  const toggleEnglish = () => {
    if (!prefs) return;
    if (englishShow) return savePrefs({ ...prefs, original: !prefs.original });
    if (!prefs.english) translateAsked.current = false;
    savePrefs({ ...prefs, english: !prefs.english });
  };

  useEffect(() => { if (audio.current && prefs) audio.current.playbackRate = prefs.speed; }, [prefs]);

  // Saved on the server so the phone and the iPad share it. Nothing is saved until
  // playback has actually started here, so opening an episode can't reset it.
  const savePosition = useCallback((done = false, beacon = false) => {
    if (!listened.current) return;
    const body = JSON.stringify({ action: "position", seconds: lastTime.current, done });
    if (beacon && navigator.sendBeacon?.(base, body)) return;
    void fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
  }, [base]);

  const applyPending = useCallback(() => {
    const player = audio.current;
    const target = pending.current;
    if (!player || target === null || player.readyState === 0) return;
    if (Math.abs(player.currentTime - target) > 0.5) player.currentTime = Math.min(target, Number.isFinite(player.duration) ? player.duration - 1 : target);
    if (Math.abs(player.currentTime - target) <= 1) pending.current = null;
  }, []);

  const seekTo = useCallback((seconds: number, play = false) => {
    const player = audio.current;
    if (!player) return;
    const target = Math.max(0, Math.min(seconds, Number.isFinite(player.duration) ? player.duration : seconds));
    pending.current = target;
    lastTime.current = target;
    applyPending();
    setTime(target);
    setFollowing(true);
    if (play) void player.play().catch(() => setAudioError(true));
  }, [applyPending]);

  const selectLine = useCallback((index: number) => {
    if (lines?.[index]) seekTo(lines[index].start, true);
  }, [lines, seekTo]);

  const toggle = useCallback(() => {
    const player = audio.current;
    if (!player) return;
    if (player.paused) {
      applyPending();
      void player.play().catch(() => setAudioError(true));
    } else player.pause();
  }, [applyPending]);

  // Previous/next move between spoken lines, stepping over ad breaks.
  const step = useCallback((delta: number) => {
    if (!lines?.length) return;
    let target = active < 0 && delta < 0 ? 0 : active + delta;
    while (target >= 0 && target < lines.length && lines[target].ad) target += delta;
    if (target < 0 || target >= lines.length) return;
    seekTo(lines[target].start);
  }, [lines, active, seekTo]);

  // Keyboard (iPad keyboard, desktop): Space plays/pauses, arrows step lines.
  const audioReady = !!data?.audioReady;
  useEffect(() => {
    if (!audioReady) return;
    const typing = (target: EventTarget | null) =>
      target instanceof HTMLElement && (target.isContentEditable || /^(TEXTAREA|SELECT)$/.test(target.tagName) || (target instanceof HTMLInputElement && target.type !== "range"));
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      if (e.key === " ") {
        e.preventDefault();
        if (!e.repeat) toggle();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        step(e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1);
      }
    };
    // A focused line or button would otherwise also "click" on Space's keyup.
    const up = (e: KeyboardEvent) => { if (e.key === " " && !typing(e.target)) e.preventDefault(); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [audioReady, toggle, step]);

  const blocks = useMemo<Block[]>(() => {
    const out: Block[] = [];
    lines?.forEach((line, index) => {
      const last = out[out.length - 1];
      if (!line.ad) out.push({ kind: "line", index });
      else if (last?.kind === "ad" && last.to === index - 1) last.to = index;
      else out.push({ kind: "ad", from: index, to: index });
    });
    return out;
  }, [lines]);

  const skipAd = useCallback((from: number) => {
    if (!lines) return;
    let next = from;
    while (next < lines.length && lines[next].ad) next++;
    seekTo(next < lines.length ? lines[next].start : lines[next - 1].end, true);
  }, [lines, seekTo]);

  // The row on screen for the active line: an ad break shows as one row keyed by its first line.
  let activeRow = active;
  while (lines && activeRow > 0 && lines[activeRow]?.ad && lines[activeRow - 1].ad) activeRow--;

  // Lock-screen and headphone controls.
  useEffect(() => {
    if (!data || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: data.episode.title, artist: data.show.title });
    const player = audio.current;
    navigator.mediaSession.setActionHandler("play", () => { void player?.play(); });
    navigator.mediaSession.setActionHandler("pause", () => player?.pause());
    navigator.mediaSession.setActionHandler("seekbackward", () => player && seekTo(player.currentTime - 10));
    navigator.mediaSession.setActionHandler("seekforward", () => player && seekTo(player.currentTime + 10));
    return () => {
      for (const action of ["play", "pause", "seekbackward", "seekforward"] as const) navigator.mediaSession.setActionHandler(action, null);
    };
  }, [data?.episode.title, data?.show.title, seekTo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const flush = () => savePosition(false, true);
    const hidden = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hidden);
    return () => { flush(); window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", hidden); };
  }, [savePosition]);

  // Keep the playing line in view unless the reader scrolled away.
  const scrollToActive = useCallback((force: boolean) => {
    const box = list.current;
    const row = box?.querySelector<HTMLElement>(`[data-line="${activeRow}"]`);
    if (!box || !row) return;
    const top = row.offsetTop - box.scrollTop;
    const h = box.clientHeight;
    if (!force && top >= h * 0.1 && top + row.offsetHeight <= h * 0.7) return;
    const target = Math.max(0, row.offsetTop - h * 0.3);
    const far = Math.abs(target - box.scrollTop) > h * 3;
    programmaticUntil.current = Date.now() + (far ? 300 : 1000);
    box.scrollTo({ top: target, behavior: far ? "auto" : "smooth" });
  }, [activeRow]);

  useEffect(() => { if (following) scrollToActive(false); }, [activeRow, following, scrollToActive, subtitle]);
  const manualScroll = () => { if (Date.now() > programmaticUntil.current) setFollowing(false); };

  const englishLines = useMemo(() => {
    if (!lines || !subtitle) return null;
    return englishShow ? lines.map((line) => line.source ?? "") : lines.map((_, i) => data?.en?.[i] ?? "");
  }, [subtitle, englishShow, lines, data?.en]);

  if (loadError && !data) {
    return <main className="container max-w-2xl py-6"><p role="alert" className="text-sm text-destructive">{loadError}</p></main>;
  }
  if (!data || !prefs) return <main className="container max-w-2xl py-6"><div className="h-64 animate-pulse rounded-xl bg-muted" /></main>;

  const total = duration || data.episode.duration || 0;
  const working = data.stage !== "ready" && data.stage !== "failed";
  const status = data.stage === "downloading" ? "Downloading audio" : data.stage === "transcribing" ? "Transcribing" : "Starting";

  return (
    <main className="container flex h-[calc(100dvh-3.5rem)] max-w-2xl flex-col pt-3">
      <div className="mb-2 shrink-0">
        <Link href="/podcasts" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Podcasts</Link>
        <h1 lang={data.show.language} className="mt-1 line-clamp-2 text-lg font-semibold leading-snug">{data.episode.title}</h1>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={list} onScroll={manualScroll} onTouchMove={manualScroll} onWheel={manualScroll} className="h-full overflow-y-auto overscroll-contain pb-4" aria-label="Transcript">
          {lines && blocks.map((block) => block.kind === "ad"
            ? <AdRow key={`ad-${block.from}`} from={block.from} start={lines[block.from].start} end={lines[block.to].end} active={active >= block.from && active <= block.to} onSkip={skipAd} />
            : <Row key={block.index} index={block.index} line={lines[block.index]} en={englishLines ? englishLines[block.index] : null} active={block.index === active} past={block.index < active} onSelect={selectLine} />)}
          {lines && lines.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No speech found in this episode.</p>}
          {working && (
            <div className="flex flex-col items-center gap-3 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p>{status}{data.progress > 0 ? ` · ${Math.round(data.progress * 100)}%` : "…"}</p>
            </div>
          )}
          {data.stage === "failed" && (
            <div role="alert" className="space-y-3 py-12 text-center text-sm">
              <p className="text-destructive">{data.error ?? "Transcription failed."}</p>
              <Button variant="outline" size="sm" onClick={() => { started.current = true; void post({ action: "transcribe" }).then(() => load()); }}>Try again</Button>
            </div>
          )}
        </div>
        {!following && lines && active >= 0 && (
          <button type="button" onClick={() => { setFollowing(true); scrollToActive(true); }} className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium shadow-md">
            <LocateFixed className="h-3.5 w-3.5" />Follow
          </button>
        )}
      </div>

      <div className="shrink-0 border-t pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        {data.audioReady && (
          <audio
            ref={audio}
            preload="metadata"
            src={`${base}/media`}
            onLoadedMetadata={() => {
              const player = audio.current!;
              setDuration(player.duration);
              player.playbackRate = prefs.speed;
              applyPending();
              setAudioError(false);
            }}
            onCanPlay={applyPending}
            onTimeUpdate={() => {
              const player = audio.current!;
              // Until the saved position is applied, keep showing it rather than 0:00.
              if (pending.current !== null) { applyPending(); if (pending.current !== null) return; }
              lastTime.current = player.currentTime;
              setTime(player.currentTime);
              if (!player.paused && Date.now() - lastSaved.current > 10000) { lastSaved.current = Date.now(); savePosition(); }
            }}
            onPlay={() => { listened.current = true; setPlaying(true); }}
            onPause={() => { setPlaying(false); if (pending.current === null) savePosition(); }}
            onSeeked={() => { if (pending.current === null && listened.current) { lastTime.current = audio.current!.currentTime; savePosition(); } }}
            onEnded={() => { setPlaying(false); savePosition(true); }}
            onError={() => setAudioError(true)}
          />
        )}
        <div className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
          <span className="w-11">{formatClock(time)}</span>
          <input
            type="range"
            aria-label="Position"
            min={0}
            max={total || 1}
            step={1}
            value={Math.min(time, total || 1)}
            disabled={!data.audioReady}
            onChange={(e) => seekTo(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer accent-blue-600"
          />
          <span className="w-11 text-right">{formatClock(total)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-1">
          <button
            type="button"
            onClick={() => savePrefs({ ...prefs, speed: SPEEDS[(SPEEDS.indexOf(prefs.speed) + 1) % SPEEDS.length] })}
            aria-label={`Speed ${prefs.speed}×`}
            className="h-10 w-14 rounded-md text-sm font-medium tabular-nums hover:bg-accent"
          >{prefs.speed}×</button>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Previous line" disabled={!lines?.length || !data.audioReady} onClick={() => step(-1)}><SkipBack className="h-5 w-5" /></Button>
            <Button size="icon" className="h-14 w-14 rounded-full" aria-label={playing ? "Pause" : "Play"} disabled={!data.audioReady} onClick={toggle}>
              {playing ? <Pause className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6" />}
            </Button>
            <Button variant="ghost" size="icon" aria-label="Replay line" disabled={!lines?.length || !data.audioReady} onClick={() => lines && seekTo(lines[Math.max(0, active)].start, true)}><RotateCcw className="h-5 w-5" /></Button>
            <Button variant="ghost" size="icon" aria-label="Next line" disabled={!lines?.length || !data.audioReady} onClick={() => step(1)}><SkipForward className="h-5 w-5" /></Button>
          </div>
          <button
            type="button"
            onClick={toggleEnglish}
            aria-pressed={subtitle}
            aria-label={englishShow ? "Show the English under the French" : "English translation"}
            className={cn("h-10 w-14 rounded-md text-sm font-medium transition-colors", subtitle ? "bg-blue-500/15 text-blue-700 dark:text-blue-300" : "text-muted-foreground hover:bg-accent")}
          >EN{(english || englishShow) && data.translating ? <Loader2 className="ml-1 inline h-3 w-3 animate-spin" /> : null}</button>
        </div>
        {(audioError || ((english || englishShow) && data.translateError)) && (
          <p role="alert" className="mt-2 text-center text-xs text-destructive">
            {audioError ? <>Couldn’t play the audio. <button className="underline" onClick={() => { setAudioError(false); audio.current?.load(); }}>Retry</button></> : <>
              {data.translateError}
              {englishShow && <> <button className="underline" onClick={() => askFrench(Math.max(0, active))}>Retry</button></>}
            </>}
          </p>
        )}
      </div>
    </main>
  );
}
