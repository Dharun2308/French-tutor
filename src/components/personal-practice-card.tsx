"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FrenchInput } from "@/components/french-input";
import { RateButtons } from "@/components/rate-buttons";
import { SpeakButton } from "@/components/speak-button";
import { createReviewRequestId, reviewElapsedMs } from "@/lib/client-review";
import type { Rating } from "@/types";

export interface PersonalPracticeItem {
  id: number;
  promptEn: string;
  targetFr: string;
  weekly: boolean;
}

interface Grade {
  verdict: string;
  corrected: string;
  reason: string;
  errorType?: string;
  suggestedRating: Rating | null;
  gradedBy: string | null;
}

export function PersonalPracticeCard({ item, onComplete }: {
  item: PersonalPracticeItem;
  onComplete: (rating: Rating) => void;
}) {
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [grade, setGrade] = useState<Grade | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const started = useRef(Date.now());
  const requestId = useRef<string | null>(null);

  const check = async (reveal = false) => {
    if (locked.current || grade || (!reveal && !answer.trim())) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    setSubmitted(answer);
    try {
      if (reveal) {
        setGrade({ verdict: "WRONG", corrected: item.targetFr, reason: "Review the answer, then rate it.", suggestedRating: 0, gradedBy: "local" });
      } else {
        const response = await fetch("/api/ai/grade-item", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemId: item.id, attempt: answer.trim(), direction: "production" }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not check this answer.");
        setGrade(data);
      }
    } catch {
      setGrade({ verdict: "UNGRADED", corrected: item.targetFr, reason: "Checking is unavailable. Compare your answer and rate yourself.", suggestedRating: null, gradedBy: null });
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  const rate = async (rating: Rating) => {
    if (locked.current || !grade) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    requestId.current ??= createReviewRequestId();
    try {
      const response = await fetch("/api/items/review", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: requestId.current, itemId: item.id, rating,
          direction: "production", verdict: grade.verdict, userAnswer: submitted,
          correctedAnswer: grade.corrected.slice(0, 500), gradeReason: grade.reason.slice(0, 1000),
          errorType: grade.errorType, gradedBy: grade.gradedBy ?? undefined,
          elapsedMs: reviewElapsedMs(started.current) }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Could not save your answer.");
      onComplete(rating);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  return <Card><CardContent className="space-y-5 p-6">
    <p className="text-xs text-muted-foreground">{item.weekly ? "This week’s phrases" : "From your lessons"} · English → French</p>
    <p className="text-lg">{item.promptEn}</p>
    {!grade ? <>
      <FrenchInput autoFocus maxLength={500} disabled={busy} value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void check(); } }}
        placeholder="Type it in French" />
      <div className="flex gap-2">
        <Button className="flex-1" disabled={busy || !answer.trim()} onClick={() => check()}>{busy ? "Checking…" : "Check"}</Button>
        <Button variant="outline" disabled={busy} onClick={() => check(true)}>Reveal</Button>
      </div>
    </> : <>
      <div className="space-y-3 rounded-lg bg-muted p-4">
        <div><p className="text-xs text-muted-foreground">You typed</p><p lang="fr" className="whitespace-pre-wrap">{submitted || "—"}</p></div>
        <div className="border-t pt-3"><p className="text-xs text-muted-foreground">Correct answer</p>
          <div className="flex items-start gap-2"><p lang="fr" className="flex-1 text-lg">{grade.corrected}</p><SpeakButton text={grade.corrected} /></div>
        </div>
        <p className="text-sm">{grade.reason}</p>
      </div>
      <RateButtons onRate={rate} disabled={busy} />
    </>}
    {error && <p className="text-sm text-destructive">{error} Try rating again to save.</p>}
  </CardContent></Card>;
}
