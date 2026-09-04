"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Ear, Loader2, RotateCcw, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FrenchInput } from "@/components/french-input";
import { AccentBar } from "@/components/accent-bar";
import { RateButtons } from "@/components/rate-buttons";
import { useTts } from "@/components/tts-provider";
import { speak } from "@/lib/client-tts";
import { createReviewRequestId, reviewElapsedMs } from "@/lib/client-review";
import type { Rating } from "@/types";

interface Item { id: number; promptEn: string; targetFr: string; mode: string; reps: number }
interface Grade { verdict: string; errorType?: string; corrected: string; reason: string; suggestedRating: Rating | null; gradedBy: string | null }

export default function ListeningPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<"answer" | "grading" | "graded" | "done">("answer");
  const [grade, setGrade] = useState<Grade | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { mode, voice } = useTts();
  const startedAt = useRef(Date.now());
  const requestId = useRef<string | null>(null);
  const saving = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const item = items?.[index];

  useEffect(() => {
    fetch("/api/items/listening?count=10", { cache: "no-store" })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; })
      .then((d) => setItems(d.items ?? []))
      .catch((e) => setMessage(e.message));
  }, []);

  const play = async (rate: number) => {
    if (!item || playing) return;
    setPlaying(true);
    try { await speak(mode, item.targetFr, voice, rate); }
    finally { setPlaying(false); }
  };

  const check = async () => {
    if (!item || !answer.trim()) return;
    setPhase("grading");
    try {
      const r = await fetch("/api/ai/grade-item", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId: item.id, attempt: answer.trim(), direction: "listening" }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setGrade(d);
    } catch (e) {
      setGrade({ verdict: "UNGRADED", errorType: "other", corrected: item.targetFr, reason: "Compare the transcript and rate yourself.", suggestedRating: null, gradedBy: null });
      setMessage(e instanceof Error ? e.message : String(e));
    }
    setPhase("graded");
  };

  const reveal = () => {
    if (!item) return;
    setGrade({ verdict: "WRONG", corrected: item.targetFr, reason: "Listen again while reading the transcript.", suggestedRating: 0, gradedBy: "local" });
    setPhase("graded");
  };

  const rate = async (rating: Rating) => {
    if (!item || !grade || saving.current) return;
    saving.current = true;
    setSubmitting(true);
    requestId.current ??= createReviewRequestId();
    try {
      const r = await fetch("/api/items/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId: requestId.current, itemId: item.id, rating, direction: "listening", verdict: grade.verdict, errorType: grade.errorType, userAnswer: answer.trim() || undefined, correctedAnswer: grade.corrected, gradeReason: grade.reason, elapsedMs: reviewElapsedMs(startedAt.current), gradedBy: grade.gradedBy ?? undefined }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMessage(d.error ?? "Could not save review"); return; }
      requestId.current = null;
      if (!items || index + 1 >= items.length) { setPhase("done"); return; }
      setIndex((i) => i + 1); setAnswer(""); setGrade(null); setMessage(null); setPhase("answer"); startedAt.current = Date.now();
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save review");
    } finally {
      saving.current = false;
      setSubmitting(false);
    }
  };

  if (!items) return <main className="container max-w-xl py-10"><div className="h-52 animate-pulse rounded-xl bg-muted" /></main>;
  if (items.length === 0) return <main className="container max-w-xl py-10"><p>No lesson items yet.</p><Button asChild className="mt-4"><Link href="/import">Import notes</Link></Button></main>;
  if (phase === "done") return <main className="container max-w-xl py-10"><Card><CardContent className="py-10 text-center"><Ear className="mx-auto mb-3 h-9 w-9"/><h1 className="text-2xl font-semibold">Listening complete</h1><p className="mt-2 text-muted-foreground">Your listening evidence and review schedule are saved.</p><Button asChild className="mt-5"><Link href="/">Back home</Link></Button></CardContent></Card></main>;
  if (!item) return null;

  return (
    <main className="container max-w-xl py-6">
      <Link href="/" className="mb-5 inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4"/>Home</Link>
      <div className="mb-4 flex items-center justify-between"><div><h1 className="text-2xl font-semibold">Listening</h1><p className="text-sm text-muted-foreground">Sound first. Type what you hear.</p></div><span className="text-sm text-muted-foreground">{index + 1}/{items.length}</span></div>
      <Card>
        <CardHeader><CardTitle className="text-center text-base font-medium text-muted-foreground">The transcript is hidden</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <Button size="lg" className="h-20 w-full text-lg" onClick={() => play(1)} disabled={playing}><Volume2 className="h-6 w-6"/>{playing ? "Playing…" : "Listen at 1×"}</Button>
          <div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => play(.85)} disabled={playing}><RotateCcw className="h-4 w-4"/>0.85×</Button><Button variant="outline" onClick={() => play(.7)} disabled={playing}><RotateCcw className="h-4 w-4"/>0.7×</Button></div>
          {phase === "answer" || phase === "grading" ? <>
            <FrenchInput ref={inputRef} value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => e.key === "Enter" && check()} placeholder="Type the French you hear" />
            <AccentBar inputRef={inputRef} value={answer} onChange={setAnswer}/>
            <div className="flex gap-2"><Button className="flex-1" onClick={check} disabled={!answer.trim() || phase === "grading"}>{phase === "grading" && <Loader2 className="h-4 w-4 animate-spin"/>}Check</Button><Button variant="ghost" onClick={reveal}>Reveal</Button></div>
          </> : <>
            <div className="rounded-lg bg-muted p-4"><p className="text-lg font-medium">{grade?.corrected}</p><p className="mt-1 text-sm text-muted-foreground">{item.promptEn}</p>{grade?.reason && <p className="mt-3 text-sm">{grade.reason}</p>}</div>
            <Button variant="outline" className="w-full" onClick={() => play(.85)}><Volume2 className="h-4 w-4"/>Listen while reading</Button>
            <RateButtons onRate={rate} disabled={submitting}/>
          </>}
          {message && <p className="text-sm text-destructive">{message}</p>}
        </CardContent>
      </Card>
    </main>
  );
}
