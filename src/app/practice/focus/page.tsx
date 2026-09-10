"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock3, Ear, Loader2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FrenchInput } from "@/components/french-input";
import { RateButtons } from "@/components/rate-buttons";
import { SpeakButton } from "@/components/speak-button";
import { useTts } from "@/components/tts-provider";
import { speak } from "@/lib/client-tts";
import { createReviewRequestId, reviewElapsedMs } from "@/lib/client-review";
import type { Rating } from "@/types";

interface PlanItem { id: number; itemId: number; direction: "production" | "listening"; source: string; freshContext?: boolean; variationId?: number; variationUnavailable?: boolean; unavailable?: boolean; promptEn: string; targetFr: string }
interface Session { sessionId: number | null; startedAt: string; currentIndex: number; items: PlanItem[]; caughtUp?: boolean }
interface Grade { verdict: string; errorType?: string; corrected: string; reason: string; suggestedRating: Rating | null; gradedBy: string | null }

export default function FocusPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submittedAnswer, setSubmittedAnswer] = useState("");
  const [grade, setGrade] = useState<Grade | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [prepareRetry, setPrepareRetry] = useState(0);
  const [now, setNow] = useState(Date.now());
  const { mode, voice } = useTts();
  const started = useRef(Date.now());
  const timerStarted = useRef(Date.now());
  const preparationStarted = useRef<number | null>(null);
  const requestId = useRef<string | null>(null);
  const saving = useRef(false);
  const item = session?.items[index];
  const needsContext = Boolean(item?.freshContext && !item.variationId && !item.variationUnavailable && !item.unavailable);
  useEffect(() => {
    if (!needsContext || !session?.sessionId) return;
    let cancelled = false;
    preparationStarted.current = Date.now();
    setPrepareError(null);
    fetch("/api/focus-session/card", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: session.sessionId, index }) })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; })
      .then(data => { if (!cancelled) { setSession(data); started.current = Date.now(); } })
      .catch(error => { if (!cancelled) setPrepareError(error.message); });
    return () => {
      cancelled = true;
      if (preparationStarted.current !== null) timerStarted.current += Date.now() - preparationStarted.current;
      preparationStarted.current = null;
    };
  }, [session?.sessionId, index, needsContext, prepareRetry]);
  useEffect(() => { fetch("/api/focus-session", { cache: "no-store" }).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; }).then((d) => { setSession(d); setIndex(Math.min(d.currentIndex, Math.max(0, d.items.length - 1))); }).catch((e) => setError(String(e))); }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const seconds = Math.max(0, 600 - Math.floor(((preparationStarted.current ?? now) - timerStarted.current) / 1000));
  const check = async () => { if (busy || needsContext || !item || item.unavailable || !answer.trim()) return; const attempt = answer.trim(); setSubmittedAnswer(attempt); setError(null); setBusy(true); try { const r = await fetch("/api/ai/grade-item", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId: item.itemId, attempt, variationId: item.variationId, direction: item.direction }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setGrade(d); } catch (e) { setError(e instanceof Error ? e.message : String(e)); setGrade({ verdict: "UNGRADED", errorType: "other", corrected: item.targetFr, reason: "Compare and rate yourself.", suggestedRating: null, gradedBy: null }); } finally { setBusy(false); } };
  const reveal = () => { if (!item || needsContext || item.unavailable) return; setSubmittedAnswer(answer.trim()); setGrade({ verdict: "WRONG", corrected: item.targetFr, reason: "Review the answer, then rate it.", suggestedRating: 0, gradedBy: "local" }); };
  const rate = async (rating: Rating) => { if (!session || !session.sessionId || !item || !grade || saving.current) return; saving.current = true; setError(null); setBusy(true); requestId.current ??= createReviewRequestId(); try {
    const r = await fetch("/api/items/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId: requestId.current, itemId: item.itemId, rating, direction: item.direction, verdict: grade.verdict, errorType: grade.errorType, userAnswer: submittedAnswer || undefined, correctedAnswer: grade.corrected.slice(0, 500), gradeReason: grade.reason.slice(0, 1000), elapsedMs: reviewElapsedMs(started.current), gradedBy: grade.gradedBy ?? undefined }) }); if (!r.ok) throw new Error((await r.json()).error);
    const next = index + 1; const finish = next >= session.items.length; const advance = await fetch("/api/focus-session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: session.sessionId, currentIndex: next, finish }) }); if (!advance.ok) throw new Error((await advance.json()).error ?? "Could not advance the session."); requestId.current = null; setIndex(next); setError(null); setAnswer(""); setSubmittedAnswer(""); setGrade(null); started.current = Date.now();
  } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { saving.current = false; setBusy(false); } };
  const startFresh = async () => {
    if (busy || needsContext || (answer.trim() && !window.confirm("Discard this answer and start a fresh session?"))) return;
    setBusy(true); setError(null);
    try {
      if (session?.sessionId && index < session.items.length) {
        const response = await fetch("/api/focus-session", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: session.sessionId, currentIndex: index, restart: true }) });
        if (!response.ok) throw new Error("Could not close this session.");
      }
      const response = await fetch("/api/focus-session", { cache: "no-store" });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setSession(data); setIndex(data.currentIndex); setAnswer(""); setSubmittedAnswer(""); setGrade(null);
      setPrepareError(null); requestId.current = null; timerStarted.current = Date.now(); started.current = Date.now(); setNow(Date.now());
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  };
  const skipUnavailable = async () => {
    if (!session?.sessionId || busy) return;
    setBusy(true);
    try {
      const next = index + 1;
      const response = await fetch("/api/focus-session", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: session.sessionId, currentIndex: next, finish: next >= session.items.length }) });
      if (!response.ok) throw new Error("Could not advance the session.");
      setIndex(next); started.current = Date.now();
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  };
  if (!session) return <main className="container max-w-xl py-8">{error ? <p className="text-destructive">{error}</p> : <div className="h-52 animate-pulse rounded-xl bg-muted"/>}</main>;
  if (!session.items.length) return <main className="container max-w-xl py-8"><h1 className="text-2xl font-semibold">{session.caughtUp ? "All caught up" : "Build your focus practice"}</h1><p className="mt-3 text-muted-foreground">{session.caughtUp ? "Your available phrases were recently rated Good or Easy. They get a 24-hour break; a later miss brings them back sooner." : "Import lesson notes to build a focus session."}</p><Button asChild className="mt-5"><Link href={session.caughtUp ? "/topics" : "/import"}>{session.caughtUp ? "Practise a topic" : "Import notes"}</Link></Button></main>;
  if (index >= session.items.length) return <main className="container max-w-xl py-8"><Card><CardContent className="py-10 text-center"><h1 className="text-2xl font-semibold">Focus session complete</h1><p className="mt-2 text-muted-foreground">Due, weak, listening, and correction evidence is saved together.</p><div className="mt-5 flex flex-wrap justify-center gap-2"><Button onClick={startFresh} disabled={busy}>Start another focus</Button><Button asChild variant="outline"><Link href="/progress">See progress</Link></Button></div>{error && <p className="mt-3 text-destructive">{error}</p>}</CardContent></Card></main>;
  if (!item) return null;
  const sourceLabel: Record<string, string> = { due: "due review", weekly: "this week’s phrases", weak: "weak item", listening: "listening focus", correction: "recent correction", backfill: "personal review" };
  return <main className="container max-w-xl py-6">
    <div className="mb-5 flex items-center justify-between"><Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4"/>Home</Link><span className={seconds === 0 ? "text-sm text-amber-600" : "text-sm text-muted-foreground"}><Clock3 className="mr-1 inline h-4 w-4"/>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span></div>
    <div className="mb-4"><h1 className="text-2xl font-semibold">10-minute focus</h1><p className="text-sm text-muted-foreground">{index + 1}/{session.items.length} · {sourceLabel[item.source] ?? item.source} · {item.direction === "listening" ? "listen & type" : "English → French"}</p></div>
    {session.items.length < 12 && <p className="mb-3 text-sm text-muted-foreground">A shorter session today: recently successful phrases are resting.</p>}
    <Card><CardContent className="space-y-5 p-6">
      {item.variationId && <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Fresh context · same skill</p>}
      {item.variationUnavailable && <p className="text-xs text-muted-foreground">A fresh context is unavailable right now. Practise the saved phrase this time.</p>}
      {needsContext ? <div role="status" className="space-y-3 py-6 text-center">{prepareError ? <><p className="text-sm text-destructive">{prepareError}</p><Button variant="outline" onClick={() => setPrepareRetry(value => value + 1)}>Retry loading card</Button></> : <><Loader2 className="mx-auto h-6 w-6 animate-spin" /><p>Preparing a fresh context…</p></>}</div> : item.unavailable ? <><p>{item.promptEn}</p><Button disabled={busy} onClick={skipUnavailable}>Skip unavailable card</Button></> : <>
      {item.direction === "listening" && !grade ? <Button className="h-20 w-full text-lg" onClick={() => speak(mode, item.targetFr, voice, 1)}><Ear className="h-6 w-6"/>Listen</Button> : !grade ? <p className="text-xl">{item.promptEn}</p> : null}
      {!grade ? <><FrenchInput maxLength={500} disabled={busy} value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => e.key === "Enter" && check()} placeholder={item.direction === "listening" ? "Type what you hear" : "Type it in French"}/><div className="flex gap-2"><Button className="flex-1" onClick={check} disabled={busy || !answer.trim()}>{busy && <Loader2 className="h-4 w-4 animate-spin"/>}Check</Button><Button variant="outline" onClick={reveal} disabled={busy}>Reveal</Button></div></> : <><div className="rounded-lg bg-muted p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">You typed</p>
        <p className="mt-1 text-base" lang="fr">{submittedAnswer || "—"}</p>
        <div className="my-3 border-t" />
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Correct answer</p>
        <div className="mt-1 flex gap-2"><p className="flex-1 text-lg font-medium">{grade.corrected}</p><SpeakButton text={grade.corrected}/></div>
        <p className="mt-1 text-sm text-muted-foreground">{item.promptEn}</p>{grade.reason && <p className="mt-2 text-sm">{grade.reason}</p>}
      </div><RateButtons onRate={rate} disabled={busy}/></>}
      {item.direction === "listening" && !grade && <div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => speak(mode, item.targetFr, voice, .85)}><Volume2 className="h-4 w-4"/>0.85×</Button><Button variant="outline" onClick={() => speak(mode, item.targetFr, voice, .7)}><Volume2 className="h-4 w-4"/>0.7×</Button></div>}
      </>}
      {seconds === 0 && <p className="text-center text-xs text-amber-600">Ten minutes are up—finish this card or keep going.</p>}{error && <p className="text-sm text-destructive">{error}</p>}
    </CardContent></Card>
    <Button variant="ghost" className="mt-4" disabled={busy || needsContext} onClick={startFresh}>Start a fresh session</Button>
  </main>;
}
