"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import Link from "next/link";
import { PracticeShell } from "@/components/practice-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccentBar } from "@/components/accent-bar";
import { SpeakButton } from "@/components/speak-button";
import { EmptyState } from "@/components/empty-state";
import { useHotkeys } from "@/hooks/use-hotkeys";
import {
  fetchNextCards,
  gradeDrill,
  submitReview,
  type PracticeCard,
} from "@/lib/client-practice";
import { cn } from "@/lib/utils";
import {
  PHRASE_CATEGORY_LABELS,
  FILL_BLANK_CATEGORIES,
  type PhraseCategory,
  type Rating,
} from "@/types";

// ── Phrase fill-in-the-blank card ──
interface PhraseCard {
  id: number;
  category: PhraseCategory;
  french: string; // the answer
  english: string; // sentence with ___
  notes: string | null;
  level: string;
  repetitions: number;
}

type DrillMode = "verbs" | "phrases";
type Phase = "answering" | "graded";

async function fetchPhraseDrillCards(
  count = 15
): Promise<{ cards: PhraseCard[]; error?: string }> {
  try {
    // Fetch from the phrases endpoint, filtering to fill_* categories
    const cats = FILL_BLANK_CATEGORIES.join(",");
    const res = await fetch(
      `/api/phrases/next?count=${count}&categories=${cats}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { cards: [], error: body.error ?? `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { cards: data.phrases ?? [] };
  } catch (err) {
    return { cards: [], error: err instanceof Error ? err.message : String(err) };
  }
}

async function submitPhraseReview(phraseId: number, rating: Rating) {
  await fetch("/api/phrases/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phraseId, rating }),
  });
}

export default function DrillPage() {
  const [mode, setMode] = useState<DrillMode>("verbs");
  // Verb state
  const [verbCards, setVerbCards] = useState<PracticeCard[] | null>(null);
  // Phrase state
  const [phraseCards, setPhraseCards] = useState<PhraseCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<Phase>("answering");
  const [feedback, setFeedback] = useState<
    "exact" | "accent-typo" | "wrong" | null
  >(null);
  const [correctCount, setCorrectCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load cards for the active mode
  useEffect(() => {
    setIndex(0);
    setAnswer("");
    setPhase("answering");
    setFeedback(null);
    setCorrectCount(0);
    setError(null);

    if (mode === "verbs") {
      setPhraseCards(null);
      (async () => {
        const { cards: fetched, error: err } = await fetchNextCards("drill", 15);
        if (err) setError(err);
        else setVerbCards(fetched);
      })();
    } else {
      setVerbCards(null);
      (async () => {
        const { cards: fetched, error: err } = await fetchPhraseDrillCards(15);
        if (err) setError(err);
        else setPhraseCards(fetched);
      })();
    }
  }, [mode]);

  // Current card (verb or phrase)
  const verbCard = mode === "verbs" ? verbCards?.[index] : null;
  const phraseCard = mode === "phrases" ? phraseCards?.[index] : null;
  const totalCards =
    mode === "verbs" ? (verbCards?.length ?? 0) : (phraseCards?.length ?? 0);
  const isLoading =
    mode === "verbs" ? verbCards === null : phraseCards === null;
  const hasCard = verbCard || phraseCard;

  // ── Submit answer ──
  const submit = async () => {
    if (phase !== "answering" || answer.trim() === "") return;

    if (mode === "verbs" && verbCard) {
      const { rating, feedback: fb } = gradeDrill(
        answer,
        verbCard.form,
        verbCard.repetitions
      );
      setFeedback(fb);
      setPhase("graded");
      if (rating >= 2) setCorrectCount((c) => c + 1);
      try {
        await submitReview(verbCard.cardId, rating);
      } catch (e) {
        console.error(e);
      }
    } else if (mode === "phrases" && phraseCard) {
      const { rating, feedback: fb } = gradeDrill(
        answer,
        phraseCard.french,
        phraseCard.repetitions
      );
      setFeedback(fb);
      setPhase("graded");
      if (rating >= 2) setCorrectCount((c) => c + 1);
      try {
        await submitPhraseReview(phraseCard.id, rating);
      } catch (e) {
        console.error(e);
      }
    }
  };

  // ── Next card ──
  const next = () => {
    if (index + 1 >= totalCards) {
      // Refetch
      if (mode === "verbs") {
        (async () => {
          const { cards: more } = await fetchNextCards("drill", 15);
          setVerbCards(more);
          setIndex(0);
          setAnswer("");
          setPhase("answering");
          setFeedback(null);
        })();
      } else {
        (async () => {
          const { cards: more } = await fetchPhraseDrillCards(15);
          setPhraseCards(more);
          setIndex(0);
          setAnswer("");
          setPhase("answering");
          setFeedback(null);
        })();
      }
      return;
    }
    setIndex((i) => i + 1);
    setAnswer("");
    setPhase("answering");
    setFeedback(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  useHotkeys({
    Enter: () => {
      if (phase === "answering") submit();
      else next();
    },
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, [index, mode]);

  // ── Correct answer for display ──
  const correctForm = verbCard?.form ?? phraseCard?.french ?? "";

  if (error) {
    return (
      <div className="container max-w-2xl py-10">
        <EmptyState
          title="Can't load cards"
          description={error}
          actionLabel="Go to Settings"
          actionHref="/settings"
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container max-w-2xl py-10">
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (totalCards === 0) {
    return (
      <div className="container max-w-2xl py-10">
        <EmptyState
          title="Nothing due right now 🎉"
          description={
            mode === "verbs"
              ? "No verb cards due. Try phrases, or come back later."
              : "No fill-in-the-blank phrases due. Try verbs, or come back later."
          }
          actionLabel="Back to dashboard"
          actionHref="/"
        />
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            onClick={() => setMode(mode === "verbs" ? "phrases" : "verbs")}
          >
            Switch to {mode === "verbs" ? "Phrases" : "Verbs"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <PracticeShell
      title="Fill-in-the-blank"
      subtitle="Type the correct answer and press Enter."
      current={index + 1}
      total={totalCards}
    >
      {/* Mode toggle */}
      <div className="mb-4 flex gap-2">
        <Button
          size="sm"
          variant={mode === "verbs" ? "default" : "outline"}
          onClick={() => setMode("verbs")}
        >
          Verbs
        </Button>
        <Button
          size="sm"
          variant={mode === "phrases" ? "default" : "outline"}
          onClick={() => setMode("phrases")}
        >
          Phrases
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-6 p-6">
          {/* ── Verb drill prompt ── */}
          {verbCard && (
            <>
              <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <div>
                  {verbCard.tenseLabel} ·{" "}
                  <span className="italic normal-case">
                    {verbCard.infinitive} ({verbCard.english})
                  </span>
                  {verbCard.isIrregular && (
                    <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px]">
                      irregular
                    </span>
                  )}
                </div>
                <SpeakButton text={verbCard.infinitive} />
              </div>
              <div className="flex items-baseline gap-2 text-2xl font-serif">
                <span className="text-muted-foreground">
                  {verbCard.pronoun}
                </span>
                <AnswerField
                  ref={inputRef}
                  answer={answer}
                  setAnswer={setAnswer}
                  phase={phase}
                  feedback={feedback}
                  submit={submit}
                />
              </div>
            </>
          )}

          {/* ── Phrase drill prompt ── */}
          {phraseCard && (
            <>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="rounded bg-secondary px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider">
                  {PHRASE_CATEGORY_LABELS[phraseCard.category] ??
                    phraseCard.category}
                </span>
              </div>
              <div className="text-lg leading-relaxed">
                {renderSentenceWithBlank(phraseCard.english)}
              </div>
              <div className="flex items-baseline gap-2 text-2xl font-serif">
                <AnswerField
                  ref={inputRef}
                  answer={answer}
                  setAnswer={setAnswer}
                  phase={phase}
                  feedback={feedback}
                  submit={submit}
                />
              </div>
            </>
          )}

          {phase === "answering" && (
            <>
              <AccentBar
                inputRef={inputRef}
                value={answer}
                onChange={setAnswer}
              />
              <Button onClick={submit} className="w-full" size="lg">
                Check (Enter)
              </Button>
            </>
          )}

          {phase === "graded" && (
            <div className="space-y-3">
              <GradedBanner
                feedback={feedback}
                correct={correctForm}
                notes={phraseCard?.notes}
              />
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <span>Hear it:</span>
                <SpeakButton
                  text={correctForm}
                  withPronoun={
                    verbCard
                      ? verbCard.pronoun === "il/elle"
                        ? "il"
                        : verbCard.pronoun === "ils/elles"
                          ? "ils"
                          : verbCard.pronoun
                      : undefined
                  }
                  variant="outline"
                  size="icon"
                />
              </div>
              <Button onClick={next} className="w-full" size="lg">
                Next (Enter)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/practice/sentence" className="underline">
          Want to build full sentences instead?
        </Link>
      </div>
    </PracticeShell>
  );
}

// ── Shared components ──

import React from "react";

interface AnswerFieldProps {
  answer: string;
  setAnswer: (v: string) => void;
  phase: Phase;
  feedback: "exact" | "accent-typo" | "wrong" | null;
  submit: () => void;
}

const AnswerField = React.forwardRef<HTMLInputElement, AnswerFieldProps>(
  ({ answer, setAnswer, phase, feedback, submit }, ref) => {
    if (phase === "graded") {
      return (
        <span
          className={cn(
            "flex-1 border-b border-dashed border-muted-foreground/40 pb-1",
            feedback === "wrong"
              ? "text-destructive"
              : feedback === "accent-typo"
                ? "text-amber-500"
                : "text-green-600"
          )}
        >
          {answer}
        </span>
      );
    }
    return (
      <span className="flex-1 border-b border-dashed border-muted-foreground/40 pb-1">
        <Input
          ref={ref}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="…"
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="h-10 border-0 bg-transparent px-0 text-2xl font-serif focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </span>
    );
  }
);
AnswerField.displayName = "AnswerField";

function renderSentenceWithBlank(sentence: string) {
  const parts = sentence.split("___");
  if (parts.length < 2) return <span>{sentence}</span>;
  return (
    <span>
      {parts[0]}
      <span className="inline-block w-20 border-b-2 border-dashed border-primary/50 mx-1" />
      {parts[1]}
    </span>
  );
}

function GradedBanner({
  feedback,
  correct,
  notes,
}: {
  feedback: "exact" | "accent-typo" | "wrong" | null;
  correct: string;
  notes?: string | null;
}) {
  if (feedback === "exact") {
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
          <div>Exactly right!</div>
        </div>
        {notes && (
          <div className="ml-6 text-xs text-muted-foreground italic">
            {notes}
          </div>
        )}
      </div>
    );
  }
  if (feedback === "accent-typo") {
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 text-amber-500" />
          <div>
            Close — watch the accents. The correct answer is{" "}
            <span className="font-serif font-semibold">{correct}</span>.
          </div>
        </div>
        {notes && (
          <div className="ml-6 text-xs text-muted-foreground italic">
            {notes}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
      <div className="flex items-start gap-2">
        <XCircle className="mt-0.5 h-4 w-4 text-destructive" />
        <div>
          Not quite. The correct answer is{" "}
          <span className="font-serif font-semibold">{correct}</span>.
        </div>
      </div>
      {notes && (
        <div className="ml-6 text-xs text-muted-foreground italic">
          {notes}
        </div>
      )}
    </div>
  );
}
