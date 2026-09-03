"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock3, Ear, Loader2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RateButtons } from "@/components/rate-buttons";
import { SpeakButton } from "@/components/speak-button";
import { useTts } from "@/components/tts-provider";
import { speak } from "@/lib/client-tts";
import type { Rating } from "@/types";

interface PlanItem { id: number; itemId: number; direction: "production" | "listening"; source: string; promptEn: string; targetFr: string }
interface Session { sessionId: number; startedAt: string; currentIndex: number; items: PlanItem[] }
interface Grade { verdict: string; errorType: string; corrected: string; reason: string; suggestedRating: Rating | null; gradedBy: string | null }

export default function FocusPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [grade, setGrade] = useState<Grade | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const { mode, voice } = useTts();
  const started = useRef(Date.now());
  const item = session?.items[index];
  useEffect(() => { fetch("/api/focus-session", { cache: "no-store" }).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; }).then((d) => { setSession(d); setIndex(Math.min(d.currentIndex, Math.max(0, d.items.length - 1))); }).catch((e) => setError(String(e))); }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const seconds = useMemo(() => session ? Math.max(0, 600 - Math.floor((now - new Date(session.startedAt).getTime()) / 1000)) : 600, [now, session]);
  const check = async () => { if (!item || !answer.trim()) return; setBusy(true); try { const r = await fetch("/api/ai/grade-item", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId: item.itemId, attempt: answer }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setGrade(d); } catch (e) { setError(e instanceof Error ? e.message : String(e)); setGrade({ verdict: "UNGRADED", errorType: "other", corrected: item.targetFr, reason: "Compare and rate yourself.", suggestedRating: null, gradedBy: null }); } finally { setBusy(false); } };
  const reveal = () => item && setGrade({ verdict: "WRONG", errorType: "other", corrected: item.targetFr, reason: "Review the answer, then rate it.", suggestedRating: 0, gradedBy: "local" });
  const rate = async (rating: Rating) => { if (!session || !item || !grade) return; setBusy(true); try {
    const r = await fetch("/api/items/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId: item.itemId, rating, direction: item.direction, verdict: grade.verdict, errorType: grade.errorType, userAnswer: answer || undefined, correctedAnswer: grade.corrected, gradeReason: grade.reason, elapsedMs: Date.now() - started.current, gradedBy: grade.gradedBy ?? undefined }) }); if (!r.ok) throw new Error((await r.json()).error);
    const next = index + 1; const finish = next >= session.items.length; await fetch("/api/focus-session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: session.sessionId, currentIndex: next, finish }) }); setIndex(next); setAnswer(""); setGrade(null); started.current = Date.now();
  } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  if (!session) return <main className="container max-w-xl py-8">{error ? <p className="text-destructive">{error}</p> : <div className="h-52 animate-pulse rounded-xl bg-muted"/>}</main>;
  if (!session.items.length) return <main className="container max-w-xl py-8"><p>Import lesson notes to build a focus session.</p></main>;
  if (index >= session.items.length) return <main className="container max-w-xl py-8"><Card><CardContent className="py-10 text-center"><h1 className="text-2xl font-semibold">Focus session complete</h1><p className="mt-2 text-muted-foreground">Due, weak, listening, and correction evidence is saved together.</p><Button asChild className="mt-5"><Link href="/progress">See progress</Link></Button></CardContent></Card></main>;
  if (!item) return null;
  const sourceLabel: Record<string, string> = { due: "due review", weak: "weak item", listening: "listening focus", correction: "recent correction", backfill: "personal review" };
  return <main className="container max-w-xl py-6">
    <div className="mb-5 flex items-center justify-between"><Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4"/>Home</Link><span className={seconds === 0 ? "text-sm text-amber-600" : "text-sm text-muted-foreground"}><Clock3 className="mr-1 inline h-4 w-4"/>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span></div>
    <div className="mb-4"><h1 className="text-2xl font-semibold">10-minute focus</h1><p className="text-sm text-muted-foreground">{index + 1}/{session.items.length} · {sourceLabel[item.source] ?? item.source} · {item.direction === "listening" ? "listen & type" : "English → French"}</p></div>
    <Card><CardContent className="space-y-5 p-6">
      {item.direction === "listening" && !grade ? <Button className="h-20 w-full text-lg" onClick={() => speak(mode, item.targetFr, voice, 1)}><Ear className="h-6 w-6"/>Listen</Button> : !grade ? <p className="text-xl">{item.promptEn}</p> : null}
      {!grade ? <><Input value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => e.key === "Enter" && check()} placeholder={item.direction === "listening" ? "Type what you hear" : "Type it in French"}/><div className="flex gap-2"><Button className="flex-1" onClick={check} disabled={busy || !answer.trim()}>{busy && <Loader2 className="h-4 w-4 animate-spin"/>}Check</Button><Button variant="outline" onClick={reveal}>Reveal</Button></div></> : <><div className="rounded-lg bg-muted p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">You typed</p>
        <p className="mt-1 text-base">{answer.trim() || "—"}</p>
        <div className="my-3 border-t" />
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Correct answer</p>
        <div className="mt-1 flex gap-2"><p className="flex-1 text-lg font-medium">{grade.corrected}</p><SpeakButton text={grade.corrected}/></div>
        <p className="mt-1 text-sm text-muted-foreground">{item.promptEn}</p>{grade.reason && <p className="mt-2 text-sm">{grade.reason}</p>}
      </div><RateButtons onRate={rate} disabled={busy}/></>}
      {item.direction === "listening" && !grade && <div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => speak(mode, item.targetFr, voice, .85)}><Volume2 className="h-4 w-4"/>0.85×</Button><Button variant="outline" onClick={() => speak(mode, item.targetFr, voice, .7)}><Volume2 className="h-4 w-4"/>0.7×</Button></div>}
      {seconds === 0 && <p className="text-center text-xs text-amber-600">Ten minutes are up—finish this card or keep going.</p>}{error && <p className="text-sm text-destructive">{error}</p>}
    </CardContent></Card>
  </main>;
}
