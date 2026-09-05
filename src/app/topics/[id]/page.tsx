"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen, Ear, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FrenchInput } from "@/components/french-input";
import { SpeakButton } from "@/components/speak-button";
import { useTts } from "@/components/tts-provider";
import { speak } from "@/lib/client-tts";
import { STATE_LABELS, type Topic, type TopicState, type Theory, type Stage, type TopicGrade, type SessionData } from "@/lib/curriculum/types";

interface Metric { total: number; correct: number; percent: number | null }
interface Detail extends Topic {
  state: TopicState; ready: boolean; theoryUnderstood: boolean; dueAt: string | null;
  controlled: Metric; production: Metric; mixed: Metric; oral: number; sessionId: string | null;
  errors: { tag: string; misses: number; weight: number }[];
}
interface Session {
  id: string; topicId: string; title: string; mode: SessionData["mode"]; stage: Stage;
  theory: Theory | null; target: number; answered: number; completed: boolean; provider: string | null; result: string | null;
  question: { id: string; stage: Stage; prompt: string; audio: string; hint: string | null; topicTitle: string | null; remediation: boolean } | null;
  feedback: (TopicGrade & { submitted: string; provider: string; revealed: boolean }) | null;
}
const STAGES: Record<Stage, string> = { theory: "Short theory", controlled: "Guided practice", production: "Independent production", targeted: "Targeted follow-up", mixed: "Mixed review", oral: "Speak, then write your response" };

function TheoryCard({ theory }: { theory: Theory }) {
  return <div className="space-y-4 text-sm leading-relaxed">
    {[ ["The idea", theory.meaning], ["When to use it", theory.usage], ["How to form it", theory.formation], ["Watch for", theory.caution] ].filter(([, text]) => text).map(([label, text]) => <div key={label}><p className="mb-1 font-medium">{label}</p><p className="whitespace-pre-line text-muted-foreground">{text}</p></div>)}
    <div className="space-y-3 rounded-lg bg-muted p-3">{theory.examples.map((example, index) => <div key={index}><div className="flex items-start gap-2"><p className="flex-1" lang="fr">{example.french}</p><SpeakButton text={example.french} /></div><p className="text-xs text-muted-foreground">{example.english}</p></div>)}</div>
  </div>;
}

export default function TopicPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [refreshOpen, setRefreshOpen] = useState(true);
  const [answer, setAnswer] = useState("");
  const [teachBack, setTeachBack] = useState("");
  const [spoken, setSpoken] = useState(false);
  const locked = useRef(false);
  const started = useRef(Date.now());
  const { mode, voice } = useTts();
  const load = async () => {
    const response = await fetch("/api/topics", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    const topic = data.topics.find((t: Detail) => t.id === id);
    if (!topic && id !== "mixed") throw new Error("Topic not found.");
    setDetail(topic ?? null);
    const sessionId = id === "mixed" ? data.mixedSessionId : topic?.sessionId;
    if (sessionId) {
      const r = await fetch(`/api/topics/session?id=${sessionId}`, { cache: "no-store" });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setSession(result);
    } else { setSession((current) => current?.completed ? current : null); }
    setLoaded(true);
  };
  useEffect(() => { setLoaded(false); setSession(null); setDetail(null); setError(null); load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => { setAnswer(""); setSpoken(false); started.current = Date.now(); }, [session?.question?.id]);

  useEffect(() => { setRefreshOpen(true); }, [session?.id]);

  const reloadSession = async () => {
    setBusy(true); setError(null); setConflict(false);
    try { await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(null); setConflict(false);
    try {
      const r = await fetch("/api/topics/session", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, sessionId: session?.id, questionId: session?.question?.id, ...extra }) });
      const data = await r.json();
      if (!r.ok) { setConflict(r.status === 409); throw new Error(data.error); }
      setSession(data);
      if (data.completed) await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { locked.current = false; setBusy(false); }
  };
  const start = (sessionMode: SessionData["mode"] = "learn") => call("start", { topicId: id, mode: sessionMode });
  const check = (reveal = false) => call(reveal ? "reveal" : "answer", { answer, spoken, elapsedMs: Math.max(0, Math.min(3_600_000, Date.now() - started.current)) });
  const title = id === "mixed" ? "Daily mix" : detail?.title ?? "Topic";
  const oralReady = detail && ["85_PERCENT_REACHED", "MAINTENANCE", "AUTOMATIC"].includes(detail.state);
  const errorBlock = error && <div role="alert" className="my-4 rounded-lg border border-destructive/30 p-3 text-sm"><p className="text-destructive">{error}</p>{conflict ? <Button variant="outline" className="mt-2" disabled={busy} onClick={reloadSession}>Reload saved session</Button> : <><Button variant="outline" className="mt-2 mr-3" disabled={busy} onClick={reloadSession}>Reload saved session</Button><Link href="/settings#providers" className="mt-2 inline-block underline">AI provider settings</Link></>}</div>;

  return <main className="container max-w-2xl py-7">
    <Link href="/topics" className="mb-5 inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Topics</Link>
    <h1 className="mb-4 text-2xl font-semibold">{title}</h1>
    {errorBlock}
    {!loaded ? !error && <div className="h-60 animate-pulse rounded-xl bg-muted" /> : !session || session.completed ? <>
      {session?.result && <div className="mb-5 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm leading-relaxed">{session.result}</div>}
      {detail ? <>
        <p className="mb-4 text-sm text-muted-foreground">{STATE_LABELS[detail.state]} · {detail.coverage === "practiced" ? "Previously practiced in ChatGPT" : detail.coverage === "partial" ? "Partly covered in ChatGPT" : detail.coverage === "later" ? "Later on your roadmap" : "Not systematically studied yet"}</p>
        <div className="mb-5 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Theory</p><p className="mt-1">{detail.theoryUnderstood ? "Understood · self-reported" : detail.coverage === "practiced" ? "Covered · imported history" : "Not confirmed"}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Controlled accuracy</p><p className="mt-1">{detail.controlled.total ? `${detail.controlled.correct}/${detail.controlled.total} · ${detail.controlled.percent}%` : "Not assessed here"}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Independent production</p><p className="mt-1">{detail.production.total ? `${detail.production.correct}/${detail.production.total} · ${detail.production.percent}%` : "Not assessed here"}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Speaking / automaticity</p><p className="mt-1">{detail.oral ? `${detail.oral} spoken practice prompts` : "Not assessed"}</p></div>
        </div>
        {detail.production.total > 0 && <p className="mb-4 text-xs text-muted-foreground">Accuracy uses up to 20 recent questions. Hinted or revealed answers do not count as independent successes. Ungraded answers are excluded.</p>}
        {!!detail.errors.length && <p className="mb-4 text-sm text-muted-foreground">Focus on: {detail.errors.slice(0, 3).map((e) => e.tag.toLowerCase().replaceAll("_", " ")).join(", ")}.</p>}
        {!detail.ready && <p className="mb-4 text-sm">Build accuracy in the prerequisites first: {detail.prerequisites.map((p, i) => <span key={p}>{i ? ", " : ""}<Link className="underline" href={`/topics/${p}`}>{p.replaceAll("-", " ")}</Link></span>)}.</p>}
        <div className="flex flex-col gap-2">
          <Button disabled={busy || !detail.ready} onClick={() => start()}>{detail.state === "NOT_STARTED" ? "Learn this topic" : "Continue practice"}</Button>
          {detail.state !== "NOT_STARTED" && <Button variant="outline" disabled={busy} onClick={() => start("revisit")}>Check what I remember</Button>}
          <Button variant="outline" disabled={busy || !detail.ready} onClick={() => start("theory")}><BookOpen className="h-4 w-4" />Explain the rule</Button>
          {oralReady && <Button variant="outline" disabled={busy} onClick={() => start("oral")}>Practice speaking</Button>}
        </div>
        {detail.dueAt && <p className="mt-3 text-xs text-muted-foreground">{new Date(detail.dueAt).getTime() <= Date.now() ? "Review due now" : `Next review: ${new Date(detail.dueAt).toLocaleDateString()}`}</p>}
      </> : <Card><CardContent className="space-y-4 p-5"><p className="text-sm">Ten prompts mixing old rules, your current work, unpredictable translation and speaking. You decide which grammar fits.</p><Button disabled={busy} onClick={() => start("mixed")}>Start daily mix</Button></CardContent></Card>}
    </> : session.stage === "theory" && session.theory ? <Card><CardContent className="space-y-5 p-5">
      <TheoryCard theory={session.theory} />
      {session.theory.teachBack && <div><label htmlFor="teach-back" className="text-sm">{session.theory.teachBack} <span className="text-muted-foreground">(optional)</span></label><textarea id="teach-back" className="mt-2 min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={teachBack} maxLength={1000} onChange={(e) => setTeachBack(e.target.value)} placeholder="The rule in your own words…" /></div>}
      <Button className="w-full" disabled={busy} onClick={() => call("confirm", { teachBack })}>I understand · start practice</Button>
    </CardContent></Card> : session.question ? <>
      <p className="mb-3 text-sm text-muted-foreground">{session.question.remediation ? "Quick follow-up" : `${Math.min(session.answered + (session.feedback ? 0 : 1), session.target)}/${session.target}`} · {STAGES[session.question.stage]}</p>
      {session.stage === "targeted" && session.theory && <details open={refreshOpen} onToggle={(event) => setRefreshOpen(event.currentTarget.open)} className="mb-4 rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Short rule refresh</summary><div className="mt-3"><TheoryCard theory={session.theory} /></div></details>}
      <Card><CardContent className="space-y-4 p-5">
        <p className="whitespace-pre-line text-lg">{session.question.prompt}</p>
        {session.question.audio && <Button variant="outline" disabled={busy} onClick={() => speak(mode, session.question!.audio, voice, 1)}><Ear className="h-4 w-4" />Listen</Button>}
        {!session.feedback ? <>
          {session.question.stage === "oral" && <p className="text-xs text-muted-foreground">Say your response aloud first, then type what you said. Take a moment; use a small hint if you need one. Audio is not recorded.</p>}
          <FrenchInput key={session.question.id} autoFocus maxLength={800} value={answer} disabled={busy} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (answer.trim()) void check(); } }} placeholder="Your answer…" />
          {session.question.stage === "oral" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={spoken} onChange={(e) => setSpoken(e.target.checked)} />I said this aloud</label>}
          {session.question.hint && <p className="rounded-lg bg-muted p-3 text-sm">{session.question.hint}</p>}
          <p className="text-xs text-muted-foreground">Hints and reveals count as assisted answers, not independent successes.</p>
          <div className="flex flex-wrap gap-2"><Button className="flex-1" disabled={busy || !answer.trim()} onClick={() => check()}>Check</Button><Button variant="outline" disabled={busy || !!session.question.hint} onClick={() => call("hint")}>Hint</Button><Button variant="ghost" disabled={busy} onClick={() => check(true)}>Reveal</Button></div>
        </> : <>
          <div className="space-y-3 rounded-lg bg-muted p-4">
            {session.question.topicTitle && session.mode === "mixed" && <p className="text-xs font-medium">{session.question.topicTitle}</p>}
            <div><p className="text-xs text-muted-foreground">You wrote</p><p lang="fr" className="mt-1 whitespace-pre-wrap break-words">{session.feedback.submitted || "—"}</p></div>
            <div className="border-t pt-3"><p className="text-xs text-muted-foreground">{session.feedback.ungraded ? "Possible answer · not graded" : session.feedback.revealed && session.question.stage === "oral" ? "One possible response" : session.feedback.conceptCorrect ? "Correct French" : "Correction"}</p><div className="mt-1 flex items-start gap-2"><p lang="fr" className="flex-1 break-words">{session.feedback.corrected}</p><SpeakButton text={session.feedback.corrected} /></div></div>
            <p className="text-sm">{session.feedback.explanation}</p>
            {session.feedback.minorOnly && <p className="text-xs text-muted-foreground">Your grammar counts as correct; this is a minor writing slip.</p>}
          </div>
          <Button className="w-full" disabled={busy} onClick={() => call("next")}>{session.feedback.ungraded || session.feedback.conceptCorrect ? "Continue" : "Practice a similar question"}</Button>
        </>}
      </CardContent></Card>
      <Button variant="ghost" className="mt-3 text-xs" disabled={busy} onClick={() => call("leave")}>End this session</Button>
    </> : null}
    {busy && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{session?.feedback ? "Preparing the next question…" : "Working on your lesson…"}</p>}
    {session?.provider && <p className="mt-5 text-xs text-muted-foreground">Lesson: {session.provider === "codex" ? "Codex" : session.provider === "claude" ? "Claude" : session.provider === "openai" ? "OpenAI API" : session.provider}{session.feedback ? ` · Checked by ${session.feedback.provider}` : ""}</p>}
  </main>;
}
