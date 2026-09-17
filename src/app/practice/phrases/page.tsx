"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { PracticeShell } from "@/components/practice-shell";
import { AccentBar } from "@/components/accent-bar";
import { FrenchInput } from "@/components/french-input";
import { RateButtons } from "@/components/rate-buttons";
import { SpeakButton } from "@/components/speak-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { RATINGS, RATING_LABELS, type Rating } from "@/types";
import type { FoundationsView } from "@/lib/foundations/types";
import type { FoundationsAction } from "@/lib/foundations/session";

const feedbackLabel = { CORRECT: "Correct", MINOR_ERROR: "Almost — a small writing fix", WRONG: "Let's work on this", UNGRADED: "Check your recall" };
const challengeLabel = { supported: "Basic recall", standard: "A1–A2 basics", stretch: "A1–A2 basics" };
const draftKey = (sessionId: string, questionId: string) => `foundations-draft:${sessionId}:${questionId}`;

async function request(action?: FoundationsAction): Promise<FoundationsView | null> {
  const response = await fetch("/api/foundations-session", action ? {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action),
  } : { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Couldn't load Foundations.");
  return result.session;
}

export default function FoundationsPage() {
  const [session, setSession] = useState<FoundationsView | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<string | null>("load");
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState("");
  const pending = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const startedAt = useRef(Date.now());
  const question = session?.question;
  const feedback = question?.feedback;

  const load = useCallback(async () => {
    if (pending.current) return;
    pending.current = true; setBusy("load"); setError(null);
    try {
      const saved = await request();
      setSession(saved ?? await request({ action: "start", mix: "blend" }));
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn't load this round."); }
    finally { pending.current = false; setBusy(null); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const perform = useCallback(async (action: FoundationsAction) => {
    if (pending.current) return;
    pending.current = true; setBusy(action.action); setError(null);
    try {
      const saved = await request(action);
      setSession(saved);
      if (action.action === "rate") setReceipt("Rating saved. Your recall history will guide future practice.");
      else if (action.action !== "prepare") setReceipt("");
      if ("questionId" in action && (saved?.question?.feedback || saved?.question?.id !== action.questionId)) {
        try { localStorage.removeItem(draftKey(action.sessionId, action.questionId)); } catch { /* Storage may be disabled. */ }
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn't save. Please retry."); }
    finally { pending.current = false; setBusy(null); }
  }, []);

  useEffect(() => {
    if (session?.status === "active" && question && !question.prompt && !error && !busy) {
      void perform({ action: "prepare", sessionId: session.id, questionId: question.id });
    }
  }, [session, question, error, busy, perform]);
  useEffect(() => {
    let draft = "";
    if (session?.id && question?.id) {
      try { draft = localStorage.getItem(draftKey(session.id, question.id)) ?? ""; } catch { /* Storage may be disabled. */ }
    }
    setInput(draft);
  }, [session?.id, question?.id]);
  useEffect(() => { startedAt.current = Date.now(); }, [question?.id, question?.prompt]);
  useEffect(() => {
    if (question?.prompt && !question.feedback && !busy) inputRef.current?.focus();
  }, [question?.id, question?.prompt, question?.feedback, busy]);

  const changeInput = (value: string) => {
    setInput(value);
    if (session && question) {
      try { localStorage.setItem(draftKey(session.id, question.id), value); } catch { /* The answer still stays in memory. */ }
    }
  };
  const act = (action: "skip" | "prepare" | "reveal") => {
    if (session && question) void perform({ action, sessionId: session.id, questionId: question.id });
  };
  const rate = (rating: Rating) => {
    if (session && question && feedback?.rating === null) void perform({ action: "rate", sessionId: session.id, questionId: question.id, rating });
  };
  useHotkeys(Object.fromEntries(RATINGS.map(rating => [String(rating + 1), () => rate(rating)])), !!feedback && feedback.rating === null && !busy);

  return (
    <PracticeShell title="Foundations" subtitle="Easy words and short phrases from your notes and everyday French. Your ratings guide what comes back."
      current={session?.completed ?? 0} total={session?.total ?? 0}>
      {error && <div role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <p>{error}</p>
        <Button variant="outline" size="sm" className="mt-2" disabled={!!busy} onClick={() => void load()}>Reload saved round</Button>
        {question && !question.prompt && <Button variant="outline" size="sm" className="ml-2 mt-2" disabled={!!busy} onClick={() => act("prepare")}>Retry exercise</Button>}
      </div>}
      {receipt && <p role="status" className="mb-3 text-xs text-muted-foreground">{receipt}</p>}
      {!session && busy && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Finding your next practice…</p>}
      {session && (session.status !== "active" || !question) ? (
        <Card><CardContent className="space-y-5 pt-6">
          <CheckCircle2 className="h-8 w-8 text-rose-600" />
          <div>
            <h2 className="text-xl font-semibold">{session.status === "abandoned" ? "This round has ended" : session.total ? "Round complete" : "You're caught up"}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{session.total ? "Your ratings are saved. Phrases that need practice return sooner; comfortable ones get more space." : "No basic expressions are due right now. Try Topics, add lesson notes, or check your practice filters."}</p>
          </div>
          {session.total > 0 && <>
            <dl className="grid grid-cols-4 gap-2 text-center">{RATINGS.map(rating => <div key={rating} className="rounded-lg bg-muted/50 py-3"><dt className="text-xs text-muted-foreground">{RATING_LABELS[rating]}</dt><dd className="text-xl font-semibold">{session.ratings[rating]}</dd></div>)}</dl>
            <p className="text-xs text-muted-foreground">First attempts above. {session.followUps} extra recall {session.followUps === 1 ? "attempt" : "attempts"}{session.skipped ? ` · ${session.skipped} skipped` : ""}.</p>
          </>}
          {session.recap.length > 0 && <div className="space-y-3">
            <h3 className="text-sm font-semibold">Keep these phrases close</h3>
            {session.recap.map((item, index) => <div key={index} className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">{RATING_LABELS[item.rating]} · {item.english}</p>
              <div className="mt-1 flex items-center gap-2"><p lang="fr" className="min-w-0 flex-1 font-medium">{item.french}</p><SpeakButton text={item.french} /></div>
              <p className="mt-1 text-sm text-muted-foreground">{item.explanation}</p>
            </div>)}
          </div>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={!!busy} onClick={() => void perform({ action: "start", restart: true, mix: "blend" })}>{busy === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}New round</Button>
            <Button asChild variant="outline"><Link href="/topics">Topics</Link></Button>
            <Button asChild variant="ghost"><Link href="/">Dashboard</Link></Button>
          </div>
        </CardContent></Card>
      ) : session && question ? <>
        <details className="mb-4 rounded-lg border px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">How this adapts to you</summary>
          <p className="mt-2 text-muted-foreground">Rounds mix short A1 and A2 expressions from your saved lesson notes and everyday French. Again and Hard ratings bring back phrases that need practice. Good and Easy give them longer gaps and small variations, while keeping the French simple.</p>
          <p className="mt-2 text-muted-foreground">Phrases that need practice also return after a short gap in this round, with up to three extra attempts across the round. Those are saved separately from your first recall.</p>
          <p className="mt-2 text-muted-foreground">{question.memory.again + question.memory.hard + question.memory.good + question.memory.easy > 0
            ? `Recent ratings before this round: ${question.memory.again} Again · ${question.memory.hard} Hard · ${question.memory.good} Good · ${question.memory.easy} Easy.`
            : "Your next rating will help decide when this expression returns."}</p>
        </details>
        <Card><CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{question.origin} · {question.label}</span><span>{question.followUp ? "Recall again" : challengeLabel[question.challenge]}</span>
          </div>
          <p className="text-xs text-muted-foreground">{question.reason}</p>
          {!question.prompt ? <div role="status" className="flex items-center gap-2 py-6 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Preparing a short phrase…</div> : <>
            <h2 className="text-lg font-medium leading-relaxed">{question.prompt}</h2>
            {question.fallback && <p className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">Practice the original expression for this question while fresh practice is unavailable.</p>}
            {!feedback ? <form onSubmit={event => {
              event.preventDefault();
              if (input.trim()) void perform({ action: "answer", sessionId: session.id, questionId: question.id, answer: input.trim(), elapsedMs: Math.min(3_600_000, Math.max(0, Date.now() - startedAt.current)) });
            }} className="space-y-3">
              <label htmlFor="foundations-answer" className="block text-sm font-medium">Your French</label>
              <FrenchInput id="foundations-answer" ref={inputRef} value={input} onChange={event => changeInput(event.target.value)} maxLength={500} disabled={!!busy} placeholder="Type your French…" className="h-12 text-base" />
              <fieldset disabled={!!busy}><AccentBar inputRef={inputRef} value={input} onChange={changeInput} /></fieldset>
              <Button type="submit" className="w-full" disabled={!!busy || !input.trim()}>{busy === "answer" ? <><Loader2 className="h-4 w-4 animate-spin" />Checking your French…</> : "Check answer"}</Button>
              <Button type="button" variant="outline" className="w-full" disabled={!!busy} onClick={() => act("reveal")}>Reveal answer</Button>
              {busy === "answer" && <p role="status" className="text-xs text-muted-foreground">Checking meaning and grammar. Your rating comes next.</p>}
            </form> : <div aria-live="polite" className="space-y-4">
              <div className={`rounded-lg border p-4 ${feedback.grade.verdict === "CORRECT" ? "border-green-500/30 bg-green-500/5" : "bg-muted/40"}`}>
                <h3 className="font-semibold">{feedbackLabel[feedback.grade.verdict]}</h3>
                {!feedback.revealed && <p className="mt-2 break-words text-sm text-muted-foreground">Your answer: <span lang="fr">{feedback.answer}</span></p>}
                <div className="mt-2 flex items-center gap-2"><p lang="fr" className="min-w-0 flex-1 text-lg font-medium">{feedback.grade.corrected}</p><SpeakButton text={feedback.grade.corrected} /></div>
                <p className="mt-2 text-sm">{feedback.grade.explanation}</p>
                {feedback.grade.corrected !== feedback.modelAnswer && <details className="mt-3 text-sm"><summary className="cursor-pointer text-muted-foreground">Another model answer</summary><p lang="fr" className="mt-1">{feedback.modelAnswer}</p></details>}
              </div>
              <p className="text-sm font-medium">How well did you recall it before seeing the answer?</p>
              <RateButtons disabled={!!busy} onRate={rate} />
              <p className="text-xs text-muted-foreground">Again: couldn&apos;t recall · Hard: needed help · Good: recalled with effort · Easy: effortless.</p>
              {busy === "rate" && <p role="status" className="text-xs text-muted-foreground">Saving your rating…</p>}
            </div>}
          </>}
        </CardContent></Card>
        <Button variant="ghost" size="sm" className="mt-3" disabled={!!busy} onClick={() => act("skip")}>Skip without a review</Button>
        <p className="mt-4 text-center text-xs text-muted-foreground">Your round saves as you go. Return here to resume.</p>
      </> : null}
    </PracticeShell>
  );
}
