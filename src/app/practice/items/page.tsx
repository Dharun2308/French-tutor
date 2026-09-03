"use client";
// Lesson-item review — production first. English prompt → type French →
// instant local check (or AI verdict when the answer diverges) → rate
// Again/Hard/Good/Easy → FSRS schedules the next appearance.
//
// The AI verdict is a suggestion, not the rating: the learner always makes
// the final call (Enter accepts the suggestion, 1–4 override it), and if
// every provider is down the answer is still revealed for self-rating.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Loader2,
  Star,
  Trophy,
  XCircle,
} from "lucide-react";
import { PracticeShell } from "@/components/practice-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { SpeakButton } from "@/components/speak-button";
import { AccentBar } from "@/components/accent-bar";
import { RateButtons } from "@/components/rate-buttons";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { cn } from "@/lib/utils";
import {
  LEARNING_ITEM_TYPE_LABELS,
  RATING_LABELS,
  type LearningItemType,
  type Rating,
} from "@/types";

interface ReviewCard {
  id: number;
  french: string;
  english: string;
  exampleFr: string;
  exampleEn: string;
  type: LearningItemType;
  priority: number;
  grammarTopic: string;
  cefrLevel: string;
  sourceContext: string;
  encounterCount: number;
  reps: number;
  lapses: number;
  fsrsState: number;
  mode: "example" | "phrase";
  promptEn: string;
  targetFr: string;
}

type Verdict = "CORRECT" | "ACCEPTABLE" | "MINOR_ERROR" | "WRONG" | "UNGRADED";

interface Grade {
  verdict: Verdict;
  errorType: string;
  corrected: string;
  reason: string;
  suggestedRating: Rating | null;
  gradedBy: string | null;
  target: string;
}

const TYPE_STYLE: Record<LearningItemType, string> = {
  correction: "bg-red-500/15 text-red-700 dark:text-red-300",
  phrase: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  vocabulary: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  grammar: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  pronunciation: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
};

const GRADER_LABEL: Record<string, string> = {
  local: "checked locally",
  codex: "graded by Codex",
  claude: "graded by Claude",
  openai: "graded by OpenAI",
};

const SESSION_SIZE = 20;

export default function ItemsReviewPage() {
  const [items, setItems] = useState<ReviewCard[] | null>(null);
  const [dueTotal, setDueTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<"answering" | "grading" | "graded" | "done">("answering");
  const [grade, setGrade] = useState<Grade | null>(null);
  const [gradeNote, setGradeNote] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<Rating, number>>({ 0: 0, 1: 0, 2: 0, 3: 0 });
  const [submitting, setSubmitting] = useState(false);
  const startedAt = useRef<number>(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setItems(null);
    setIndex(0);
    setAnswer("");
    setPhase("answering");
    setGrade(null);
    setGradeNote(null);
    setCounts({ 0: 0, 1: 0, 2: 0, 3: 0 });
    setError(null);
    try {
      const res = await fetch(`/api/items/next?count=${SESSION_SIZE}`, { cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setItems(d.items ?? []);
      setDueTotal(d.dueTotal ?? 0);
      startedAt.current = Date.now();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const item = items?.[index];

  const check = async () => {
    if (!item || phase !== "answering" || answer.trim() === "") return;
    setPhase("grading");
    setGradeNote(null);
    try {
      const res = await fetch("/api/ai/grade-item", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: item.id, attempt: answer.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setGrade(d as Grade);
    } catch (e) {
      // Grading must never block the session: reveal and let the learner rate.
      setGrade({
        verdict: "UNGRADED",
        errorType: "other",
        corrected: item.targetFr,
        reason: "",
        suggestedRating: null,
        gradedBy: null,
        target: item.targetFr,
      });
      setGradeNote(`Couldn't grade: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPhase("graded");
    }
  };

  const reveal = () => {
    if (!item || phase !== "answering") return;
    setGrade({
      verdict: "WRONG",
      errorType: "other",
      corrected: item.targetFr,
      reason: "",
      suggestedRating: 0,
      gradedBy: "local",
      target: item.targetFr,
    });
    setPhase("graded");
  };

  const rate = async (rating: Rating) => {
    if (!item || phase !== "graded" || submitting) return;
    setSubmitting(true);
    try {
      await fetch("/api/items/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          rating,
          direction: "production",
          verdict: grade?.verdict,
          userAnswer: answer.trim() || undefined,
          elapsedMs: Math.min(3_600_000, Date.now() - startedAt.current),
          gradedBy: grade?.gradedBy ?? undefined,
        }),
      });
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
    setCounts((c) => ({ ...c, [rating]: c[rating] + 1 }));
    if (!items || index + 1 >= items.length) {
      setPhase("done");
      return;
    }
    setIndex((i) => i + 1);
    setAnswer("");
    setGrade(null);
    setGradeNote(null);
    setPhase("answering");
    startedAt.current = Date.now();
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  useHotkeys(
    {
      Enter: () => {
        if (phase === "graded" && grade?.suggestedRating !== null && grade?.suggestedRating !== undefined) {
          rate(grade.suggestedRating);
        }
      },
      "1": () => phase === "graded" && rate(0),
      "2": () => phase === "graded" && rate(1),
      "3": () => phase === "graded" && rate(2),
      "4": () => phase === "graded" && rate(3),
    },
    phase === "graded"
  );

  useEffect(() => {
    if (phase === "answering") inputRef.current?.focus();
  }, [index, phase]);

  // ── States ──
  if (error) {
    return (
      <div className="container max-w-2xl py-10">
        <EmptyState title="Can't start a review" description={error} actionLabel="Back to dashboard" actionHref="/" />
      </div>
    );
  }
  if (!items) {
    return (
      <div className="container max-w-2xl py-10">
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="container max-w-2xl py-10">
        <EmptyState
          title="Nothing due 🎉"
          description="All your lesson items are resting. Import today's notes, or come back when the next ones are due."
          actionLabel="Import lesson notes"
          actionHref="/import"
        />
      </div>
    );
  }

  if (phase === "done") {
    const total = items.length;
    const good = counts[2] + counts[3];
    const pct = Math.round((good / total) * 100);
    const remaining = Math.max(0, dueTotal - total);
    return (
      <div className="container max-w-2xl py-10">
        <Card>
          <CardContent className="space-y-4 p-8 text-center">
            <Trophy className="mx-auto h-10 w-10 text-amber-500" />
            <h2 className="text-2xl font-semibold">Session complete</h2>
            <p className="text-muted-foreground">
              {good} / {total} produced correctly ({pct}%)
              {counts[0] > 0 && ` · ${counts[0]} to relearn`}
              {counts[1] > 0 && ` · ${counts[1]} hard`}.
              {remaining > 0 && ` ${remaining} more still due.`}
            </p>
            <div className="flex justify-center gap-3">
              <Button onClick={load}>{remaining > 0 ? "Keep going" : "Another round"}</Button>
              <Button variant="outline" asChild>
                <Link href="/">Back to dashboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!item) return null;

  const tone =
    grade?.verdict === "CORRECT" || grade?.verdict === "ACCEPTABLE"
      ? "good"
      : grade?.verdict === "MINOR_ERROR"
        ? "minor"
        : grade?.verdict === "UNGRADED"
          ? "neutral"
          : "bad";

  return (
    <PracticeShell
      title="Lesson items"
      subtitle="English → French. Type it, check, then rate how it felt."
      current={index + 1}
      total={items.length}
    >
      <Card>
        <CardContent className="space-y-5 p-6">
          {/* ── Header ── */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", TYPE_STYLE[item.type])}>
              {LEARNING_ITEM_TYPE_LABELS[item.type]}
            </span>
            <span className="inline-flex items-center gap-0.5" aria-label={`Priority ${item.priority}`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  className={cn("h-3 w-3", n <= item.priority ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")}
                />
              ))}
            </span>
            <span className="ml-auto">
              {item.reps === 0 ? "new" : `${item.reps} review${item.reps === 1 ? "" : "s"}`}
              {item.lapses > 0 && ` · ${item.lapses} lapse${item.lapses === 1 ? "" : "s"}`}
            </span>
          </div>

          {/* ── Prompt ── */}
          <p className="text-xl leading-snug">{item.promptEn}</p>

          {/* ── Answer ── */}
          {phase === "answering" || phase === "grading" ? (
            <>
              <Input
                ref={inputRef}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    check();
                  }
                }}
                placeholder="Type it in French…"
                lang="fr"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                disabled={phase === "grading"}
                className="h-12 text-lg font-serif"
              />
              <AccentBar inputRef={inputRef} value={answer} onChange={setAnswer} />
              <div className="flex gap-2">
                <Button className="flex-1" size="lg" onClick={check} disabled={phase === "grading" || !answer.trim()}>
                  {phase === "grading" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Checking…
                    </>
                  ) : (
                    "Check (Enter)"
                  )}
                </Button>
                <Button variant="outline" size="lg" onClick={reveal} disabled={phase === "grading"}>
                  I don&apos;t know
                </Button>
              </div>
            </>
          ) : (
            grade && (
              <div className="space-y-4">
                {/* Verdict */}
                <div
                  className={cn(
                    "rounded-lg border p-3 text-sm",
                    tone === "good" && "border-green-500/30 bg-green-500/10",
                    tone === "minor" && "border-amber-500/30 bg-amber-500/10",
                    tone === "bad" && "border-destructive/30 bg-destructive/10",
                    tone === "neutral" && "border-border bg-muted/50"
                  )}
                >
                  <div className="flex items-start gap-2">
                    {tone === "good" ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                    ) : tone === "minor" ? (
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    ) : tone === "neutral" ? (
                      <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        {grade.verdict === "CORRECT" && "Correct"}
                        {grade.verdict === "ACCEPTABLE" && "Acceptable — small slip"}
                        {grade.verdict === "MINOR_ERROR" && "Close — one thing to fix"}
                        {grade.verdict === "WRONG" && (answer.trim() ? "Not quite" : "Here's the answer")}
                        {grade.verdict === "UNGRADED" && "Compare and rate yourself"}
                      </div>
                      {answer.trim() && grade.verdict !== "CORRECT" && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          You wrote: <span className="font-serif" lang="fr">{answer.trim()}</span>
                        </div>
                      )}
                      {grade.reason && <div className="mt-1 text-xs">{grade.reason}</div>}
                      {gradeNote && <div className="mt-1 text-xs text-destructive">{gradeNote}</div>}
                    </div>
                  </div>
                </div>

                {/* Answer */}
                <div className="rounded-lg bg-muted/60 px-4 py-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 font-serif text-xl leading-snug" lang="fr">
                      {grade.corrected}
                    </div>
                    <SpeakButton text={grade.corrected} variant="outline" size="icon" />
                  </div>
                  {item.mode === "example" && (
                    <div className="mt-2 text-sm">
                      <span className="font-medium" lang="fr">{item.french}</span>
                      <span className="text-muted-foreground"> — {item.english}</span>
                    </div>
                  )}
                  {item.grammarTopic && (
                    <div className="mt-1 text-xs text-muted-foreground">{item.grammarTopic}</div>
                  )}
                  {item.sourceContext && item.type === "correction" && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Tutor corrected: <span className="line-through" lang="fr">{item.sourceContext}</span>
                    </div>
                  )}
                </div>

                {/* Rate */}
                <div>
                  <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>How did that feel?</span>
                    <span>
                      {grade.suggestedRating !== null
                        ? `Suggested: ${RATING_LABELS[grade.suggestedRating]} (Enter)`
                        : "1–4 to rate"}
                      {grade.gradedBy && ` · ${GRADER_LABEL[grade.gradedBy] ?? grade.gradedBy}`}
                    </span>
                  </div>
                  <RateButtons onRate={rate} disabled={submitting} />
                </div>
              </div>
            )
          )}
        </CardContent>
      </Card>
    </PracticeShell>
  );
}
