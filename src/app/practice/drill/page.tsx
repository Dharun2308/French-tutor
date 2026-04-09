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

type Phase = "answering" | "graded";

export default function DrillPage() {
  const [cards, setCards] = useState<PracticeCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<Phase>("answering");
  const [feedback, setFeedback] = useState<
    "exact" | "accent-typo" | "wrong" | null
  >(null);
  const [correctCount, setCorrectCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { cards: fetched, error: err } = await fetchNextCards("drill", 15);
      if (err) setError(err);
      else setCards(fetched);
    })();
  }, []);

  const card = cards?.[index];

  const submit = async () => {
    if (!card || phase !== "answering" || answer.trim() === "") return;
    const { rating, feedback: fb } = gradeDrill(
      answer,
      card.form,
      card.repetitions
    );
    setFeedback(fb);
    setPhase("graded");
    if (rating >= 2) setCorrectCount((c) => c + 1);
    try {
      await submitReview(card.cardId, rating);
    } catch (e) {
      console.error(e);
    }
  };

  const next = () => {
    if (!cards) return;
    if (index + 1 >= cards.length) {
      // Refetch more
      (async () => {
        const { cards: more } = await fetchNextCards("drill", 15);
        setCards(more);
        setIndex(0);
        setAnswer("");
        setPhase("answering");
        setFeedback(null);
      })();
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
  }, [index]);

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

  if (!cards) {
    return (
      <div className="container max-w-2xl py-10">
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="container max-w-2xl py-10">
        <EmptyState
          title="Nothing due right now 🎉"
          description="Come back later or expand your active tenses/levels."
          actionLabel="Back to dashboard"
          actionHref="/"
        />
      </div>
    );
  }

  if (!card) {
    return (
      <div className="container max-w-2xl py-10">
        <EmptyState
          title="Session complete"
          description={`You got ${correctCount} out of ${cards.length} right.`}
          actionLabel="Back to dashboard"
          actionHref="/"
        />
      </div>
    );
  }

  return (
    <PracticeShell
      title="Fill-in-the-blank"
      subtitle="Type the correct conjugation and press Enter."
      current={index + 1}
      total={cards.length}
    >
      <Card>
        <CardContent className="space-y-6 p-6">
          <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <div>
              {card.tenseLabel} ·{" "}
              <span className="italic normal-case">
                {card.infinitive} ({card.english})
              </span>
              {card.isIrregular && (
                <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px]">
                  irregular
                </span>
              )}
            </div>
            <SpeakButton text={card.infinitive} />
          </div>
          <div className="flex items-baseline gap-2 text-2xl font-serif">
            <span className="text-muted-foreground">{card.pronoun}</span>
            <span className="flex-1 border-b border-dashed border-muted-foreground/40 pb-1">
              {phase === "graded" ? (
                <span
                  className={
                    feedback === "wrong"
                      ? "text-destructive"
                      : feedback === "accent-typo"
                        ? "text-amber-500"
                        : "text-green-600"
                  }
                >
                  {answer}
                </span>
              ) : (
                <Input
                  ref={inputRef}
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
              )}
            </span>
          </div>
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
              <GradedBanner feedback={feedback} correct={card.form} />
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <span>Hear it:</span>
                <SpeakButton
                  text={card.form}
                  withPronoun={card.pronoun === "il/elle" ? "il" : card.pronoun === "ils/elles" ? "ils" : card.pronoun}
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

function GradedBanner({
  feedback,
  correct,
}: {
  feedback: "exact" | "accent-typo" | "wrong" | null;
  correct: string;
}) {
  if (feedback === "exact") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm">
        <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
        <div>Exactly right.</div>
      </div>
    );
  }
  if (feedback === "accent-typo") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
        <AlertCircle className="mt-0.5 h-4 w-4 text-amber-500" />
        <div>
          Close — watch the accents. The correct form is{" "}
          <span className="font-serif font-semibold">{correct}</span>.
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
      <XCircle className="mt-0.5 h-4 w-4 text-destructive" />
      <div>
        Not quite. The correct form is{" "}
        <span className="font-serif font-semibold">{correct}</span>.
      </div>
    </div>
  );
}
