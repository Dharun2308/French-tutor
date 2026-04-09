"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { PracticeShell } from "@/components/practice-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccentBar } from "@/components/accent-bar";
import { RegisterCard } from "@/components/register-card";
import { SpeakButton } from "@/components/speak-button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { useHotkeys } from "@/hooks/use-hotkeys";
import {
  fetchNextCards,
  type PracticeCard,
} from "@/lib/client-practice";
import { cn } from "@/lib/utils";
import type { Tense } from "@/types";

interface Exercise {
  cached: boolean;
  verb: { id: number; infinitive: string; english: string };
  tense: Tense;
  prompt_en: string;
  formal: string;
  neutral: string;
  informal: string;
  notes: string;
}

interface GradeResult {
  verdict: "correct" | "minor" | "major" | "wrong";
  errorType: string;
  corrected: string;
  explanation: string;
  rating: number;
}

export default function SentenceBuilderPage() {
  const [cards, setCards] = useState<PracticeCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingExercise, setLoadingExercise] = useState(false);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [answer, setAnswer] = useState("");
  const [grading, setGrading] = useState(false);
  const [grade, setGrade] = useState<GradeResult | null>(null);
  const [targetRegister, setTargetRegister] = useState<
    "formal" | "neutral" | "informal"
  >("neutral");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Bootstrap: grab a small batch of cards to know what verbs to work with.
  useEffect(() => {
    (async () => {
      const { cards: fetched, error: err } = await fetchNextCards(
        "flashcards",
        10
      );
      if (err) setError(err);
      else setCards(fetched);
    })();
  }, []);

  const card = cards?.[index];

  // Auto-generate the first exercise when a card is available.
  useEffect(() => {
    if (card && !exercise && !loadingExercise) {
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.cardId]);

  async function generate() {
    if (!card) return;
    setExercise(null);
    setAnswer("");
    setGrade(null);
    setLoadingExercise(true);
    try {
      const res = await fetch("/api/ai/sentence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          verbId: card.verbId,
          tense: card.tense,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as Exercise;
      setExercise(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingExercise(false);
    }
  }

  async function grade_() {
    if (!card || !exercise || answer.trim() === "" || grading) return;
    setGrading(true);
    setGrade(null);
    try {
      const target =
        targetRegister === "formal"
          ? exercise.formal
          : targetRegister === "informal"
            ? exercise.informal
            : exercise.neutral;
      const res = await fetch("/api/ai/grade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target,
          attempt: answer,
          infinitive: card.infinitive,
          tense: card.tense,
          cardId: card.cardId,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as GradeResult;
      setGrade(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGrading(false);
    }
  }

  function nextCard() {
    if (!cards) return;
    if (index + 1 >= cards.length) {
      (async () => {
        const { cards: more } = await fetchNextCards("flashcards", 10);
        setCards(more);
        setIndex(0);
        setExercise(null);
        setAnswer("");
        setGrade(null);
      })();
      return;
    }
    setIndex((i) => i + 1);
    setExercise(null);
    setAnswer("");
    setGrade(null);
  }

  useHotkeys({
    Enter: () => {
      if (grade) nextCard();
      else if (exercise && !grading) grade_();
    },
  });

  if (error && !cards) {
    return (
      <div className="container max-w-2xl py-10">
        <EmptyState
          title="Can't load"
          description={error}
          actionLabel="Back to dashboard"
          actionHref="/"
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
          title="No cards to work with"
          description="Seed the database or enable more tenses/levels in settings."
          actionLabel="Settings"
          actionHref="/settings"
        />
      </div>
    );
  }
  if (!card) return null;

  return (
    <PracticeShell
      title="AI sentence builder"
      subtitle={`${card.infinitive} · ${card.tenseLabel}`}
      current={index + 1}
      total={cards.length}
    >
      <Card>
        <CardContent className="space-y-6 p-6">
          {loadingExercise && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Generating exercise…
            </div>
          )}

          {exercise && (
            <>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
                  <span>Translate to French</span>
                  <SpeakButton text={card.infinitive} />
                </div>
                <p className="text-xl font-medium">{exercise.prompt_en}</p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  Target register:
                </span>
                {(["informal", "neutral", "formal"] as const).map((r) => (
                  <Button
                    key={r}
                    size="sm"
                    variant={targetRegister === r ? "default" : "outline"}
                    onClick={() => setTargetRegister(r)}
                    disabled={grading || grade !== null}
                    className="capitalize"
                  >
                    {r}
                  </Button>
                ))}
              </div>

              {!grade ? (
                <div className="space-y-3">
                  <Input
                    ref={inputRef}
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Type your French translation…"
                    className="text-lg font-serif h-12"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <AccentBar
                    inputRef={inputRef}
                    value={answer}
                    onChange={setAnswer}
                  />
                  <Button
                    onClick={grade_}
                    disabled={grading || answer.trim() === ""}
                    className="w-full"
                    size="lg"
                  >
                    {grading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Grading…
                      </>
                    ) : (
                      "Check (Enter)"
                    )}
                  </Button>
                </div>
              ) : (
                <GradeBanner grade={grade} />
              )}

              <div className="border-t pt-4">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    Three ways to say this
                  </span>
                  {exercise.cached && (
                    <Badge variant="outline" className="text-[10px]">
                      cached
                    </Badge>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <RegisterCard
                    label="Informal"
                    text={exercise.informal}
                    highlighted={targetRegister === "informal"}
                  />
                  <RegisterCard
                    label="Neutral"
                    text={exercise.neutral}
                    highlighted={targetRegister === "neutral"}
                  />
                  <RegisterCard
                    label="Formal"
                    text={exercise.formal}
                    highlighted={targetRegister === "formal"}
                  />
                </div>
                {exercise.notes && (
                  <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-sm">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Register notes
                    </div>
                    <div className="whitespace-pre-line leading-relaxed">
                      {exercise.notes}
                    </div>
                  </div>
                )}
              </div>

              {grade && (
                <Button onClick={nextCard} size="lg" className="w-full">
                  Next verb (Enter)
                </Button>
              )}

              <div className="flex justify-between text-sm">
                <Button variant="ghost" size="sm" onClick={generate}>
                  New exercise, same verb
                </Button>
                <Button variant="ghost" size="sm" onClick={nextCard}>
                  Skip verb →
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </PracticeShell>
  );
}

function GradeBanner({ grade }: { grade: GradeResult }) {
  const config = {
    correct: {
      icon: CheckCircle2,
      className: "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400",
      label: "Correct",
    },
    minor: {
      icon: AlertCircle,
      className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-500",
      label: "Almost — minor issue",
    },
    major: {
      icon: XCircle,
      className: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-500",
      label: "Needs work",
    },
    wrong: {
      icon: XCircle,
      className: "border-destructive/30 bg-destructive/10 text-destructive",
      label: "Not quite",
    },
  }[grade.verdict];
  const Icon = config.icon;
  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border p-4 text-sm",
        config.className
      )}
    >
      <div className="flex items-center gap-2 font-semibold">
        <Icon className="h-4 w-4" />
        {config.label}
      </div>
      <div className="leading-relaxed">{grade.explanation}</div>
      {grade.verdict !== "correct" && (
        <div className="mt-2 font-serif text-base">
          ✓ {grade.corrected}
        </div>
      )}
    </div>
  );
}
