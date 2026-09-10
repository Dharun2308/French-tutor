"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { PracticeShell } from "@/components/practice-shell";
import { AccentBar } from "@/components/accent-bar";
import { FrenchInput } from "@/components/french-input";
import { RateButtons } from "@/components/rate-buttons";
import { SpeakButton } from "@/components/speak-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { RATINGS, type Rating } from "@/types";
import type { SmartView } from "@/lib/smart/types";
import type { SmartAction } from "@/lib/smart/session";

const providerLabel: Record<string, string> = { codex: "Codex", claude: "Claude", openai: "OpenAI", local: "Exact answer", original: "Original card" };
const feedbackLabel = { CORRECT: "Correct", MINOR_ERROR: "Almost — a small writing fix", WRONG: "Let's work on this", UNGRADED: "Check your recall" };
const draftKey = (sessionId: string, questionId: string) => `smart-draft:${sessionId}:${questionId}`;

async function request(action?: SmartAction): Promise<SmartView | null> {
  const response = await fetch("/api/smart-session", action ? {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action),
  } : { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Couldn't load Smart session.");
  return result.session;
}

export default function SmartPracticePage() {
  const [session, setSession] = useState<SmartView | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<string | null>("load");
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const startedAt = useRef(Date.now());
  const question = session?.question;

  const load = useCallback(async () => {
    if (pending.current) return;
    pending.current = true; setBusy("load"); setError(null);
    try {
      const saved = await request();
      setSession(saved ?? await request({ action: "start" }));
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn't load this session."); }
    finally { pending.current = false; setBusy(null); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const perform = useCallback(async (action: SmartAction) => {
    if (pending.current) return;
    pending.current = true; setBusy(action.action); setError(null);
    try {
      const saved = await request(action);
      setSession(saved);
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
    startedAt.current = Date.now();
    let draft = "";
    if (session?.id && question?.id) {
      try { draft = localStorage.getItem(draftKey(session.id, question.id)) ?? ""; } catch { /* Storage may be disabled. */ }
    }
    setInput(draft);
  }, [session?.id, question?.id]);

  useEffect(() => {
    if (question?.prompt && !question.feedback && !busy) inputRef.current?.focus();
  }, [question?.id, question?.prompt, question?.feedback, busy]);

  const changeInput = (value: string) => {
    setInput(value);
    if (session && question) {
      try { localStorage.setItem(draftKey(session.id, question.id), value); } catch { /* The current answer still stays in memory. */ }
    }
  };
  const act = (action: "next" | "skip" | "prepare") => {
    if (session && question) void perform({ action, sessionId: session.id, questionId: question.id });
  };
  const feedback = question?.feedback;
  const rate = (rating: Rating) => {
    if (session && question) void perform({ action: "rate", sessionId: session.id, questionId: question.id, rating });
  };
  useHotkeys(Object.fromEntries(RATINGS.map(rating => [String(rating + 1), () => rate(rating)])), !!feedback && feedback.rating === null && !busy);

  return (
    <PracticeShell title="Smart session" subtitle="Fresh exercises for your weak French, with feedback that shapes what comes next."
      current={session?.completed ?? 0} total={session?.total ?? 0}>
      {error && <div role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <p>{error}</p>
        <Button variant="outline" size="sm" className="mt-2" disabled={!!busy} onClick={() => void load()}>Reload saved session</Button>
        {question && !question.prompt && <Button variant="outline" size="sm" className="ml-2 mt-2" disabled={!!busy} onClick={() => act("prepare")}>Retry exercise</Button>}
      </div>}
      {!session && busy && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Finding your next practice…</p>}
      {session && (session.status !== "active" || !question) ? (
        <Card><CardContent className="space-y-5 pt-6">
          <CheckCircle2 className="h-8 w-8 text-rose-600" />
          <div>
            <h2 className="text-xl font-semibold">{session.status === "abandoned" ? "This round has ended" : session.total ? "Session complete" : "You're caught up"}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{session.total ? `${session.correct} of ${session.independent} first attempts recalled successfully. ${session.followUps} follow-up${session.followUps === 1 ? "" : "s"} practiced${session.skipped ? `; ${session.skipped} skipped` : ""}.` : "No eligible cards are due. You can explore Topics or check your practice filters in Settings."}</p>
          </div>
          {session.recap.length > 0 && <div className="space-y-3">
            <h3 className="text-sm font-semibold">Take into your next conversation</h3>
            {session.recap.map((item, index) => <div key={index} className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <div className="mt-1 flex items-center gap-2"><p lang="fr" className="flex-1 font-medium">{item.correction}</p><SpeakButton text={item.correction} /></div>
              <p className="mt-1 text-sm text-muted-foreground">{item.explanation}</p>
            </div>)}
          </div>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={!!busy} onClick={() => void perform({ action: "start", restart: true })}>{busy === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}New round</Button>
            <Button asChild variant="outline"><Link href="/topics">Topics</Link></Button>
            <Button asChild variant="ghost"><Link href="/">Dashboard</Link></Button>
          </div>
          {!session.total && <Link href="/settings" className="block text-sm underline">Practice settings</Link>}
        </CardContent></Card>
      ) : session && question ? (
        <>
          <details className="mb-4 rounded-lg border px-4 py-3 text-sm">
            <summary className="cursor-pointer font-medium">Why this session?</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">{session.focus.map(reason => <li key={reason}>{reason}</li>)}</ul>
            <p className="mt-2 text-muted-foreground">Missed skills return in up to three follow-ups. These extra attempts help you practice without adding another scheduled review.</p>
          </details>
          <Card><CardContent className="space-y-4 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{question.label}</span><span className="flex items-center gap-1"><Sparkles className="h-3 w-3" />{question.followUp ? "Follow-up" : "Recall"}{question.provider ? ` · ${providerLabel[question.provider] ?? question.provider}` : ""}</span>
            </div>
            <p className="text-xs text-muted-foreground">{question.reason}</p>
            {!question.prompt ? <div role="status" className="flex items-center gap-2 py-6 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Preparing a fresh exercise…</div> : <>
              <h2 className="text-lg font-medium leading-relaxed">{question.prompt}</h2>
              {question.fallback && <p className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">AI couldn&apos;t create a fresh context. You can still practice this original card.</p>}
              {!feedback ? <form onSubmit={event => {
                event.preventDefault();
                if (input.trim()) void perform({ action: "answer", sessionId: session.id, questionId: question.id, answer: input.trim(), elapsedMs: Math.min(3_600_000, Math.max(0, Date.now() - startedAt.current)) });
              }} className="space-y-3">
                <label htmlFor="smart-answer" className="block text-sm font-medium">Your French</label>
                <FrenchInput id="smart-answer" ref={inputRef} value={input} onChange={event => changeInput(event.target.value)} maxLength={500} disabled={!!busy} placeholder="Type your answer in French…" className="h-12 text-base" />
                <fieldset disabled={!!busy}><AccentBar inputRef={inputRef} value={input} onChange={changeInput} /></fieldset>
                <Button type="submit" className="w-full" disabled={!!busy || !input.trim()}>{busy === "answer" ? <><Loader2 className="h-4 w-4 animate-spin" />Checking your French…</> : "Check answer"}</Button>
                {busy === "answer" && <p role="status" className="text-xs text-muted-foreground">The tutor is checking meaning and grammar. This can take a moment.</p>}
              </form> : <div aria-live="polite" className="space-y-4">
                <div className={`rounded-lg border p-4 ${feedback.grade.verdict === "CORRECT" ? "border-green-500/30 bg-green-500/5" : "bg-muted/40"}`}>
                  <h3 className="font-semibold">{feedbackLabel[feedback.grade.verdict]}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">Your answer: <span lang="fr">{feedback.answer}</span></p>
                  <div className="mt-2 flex items-center gap-2"><p lang="fr" className="flex-1 text-lg font-medium">{feedback.grade.corrected}</p><SpeakButton text={feedback.grade.corrected} /></div>
                  <p className="mt-2 text-sm">{feedback.grade.explanation}</p>
                  {feedback.grade.corrected !== feedback.modelAnswer && <details className="mt-3 text-sm"><summary className="cursor-pointer text-muted-foreground">Another model answer</summary><p lang="fr" className="mt-1">{feedback.modelAnswer}</p></details>}
                </div>
                {feedback.rating === null ? <div className="space-y-2"><p className="text-sm text-muted-foreground">How well did you recall it before seeing the answer?</p><RateButtons disabled={!!busy} onRate={rate} /></div> : <>
                  <p className="text-xs text-muted-foreground">{feedback.scheduled ? "Review saved." : "Follow-up saved; your review schedule is unchanged."}{feedback.rating < 2 && !question.followUp ? " We'll revisit missed skills as this round allows." : ""}</p>
                  <Button className="w-full" disabled={!!busy} onClick={() => act("next")}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}{session.completed + 1 === session.total ? "Finish session" : "Next exercise"}</Button>
                </>}
              </div>}
            </>}
          </CardContent></Card>
          {feedback?.rating == null && <Button variant="ghost" size="sm" className="mt-3" disabled={!!busy} onClick={() => act("skip")}>Skip without a review</Button>}
          <p className="mt-4 text-center text-xs text-muted-foreground">Your session saves as you go. Come back here to resume.</p>
        </>
      ) : null}
    </PracticeShell>
  );
}
