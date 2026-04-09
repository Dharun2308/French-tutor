"use client";
import { useEffect, useState } from "react";
import { PracticeShell } from "@/components/practice-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { SpeakButton } from "@/components/speak-button";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { cn } from "@/lib/utils";
import {
  fetchNextCards,
  submitReview,
  type PracticeCard,
} from "@/lib/client-practice";

export default function MultipleChoicePage() {
  const [cards, setCards] = useState<PracticeCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { cards: fetched, error: err } = await fetchNextCards(
        "multiple_choice",
        15
      );
      if (err) setError(err);
      else setCards(fetched);
    })();
  }, []);

  const card = cards?.[index];

  const pick = async (opt: string) => {
    if (!card || selected) return;
    setSelected(opt);
    const correct = opt === card.form;
    try {
      await submitReview(card.cardId, correct ? 2 : 0);
    } catch (e) {
      console.error(e);
    }
  };

  const next = () => {
    if (!cards) return;
    if (index + 1 >= cards.length) {
      (async () => {
        const { cards: more } = await fetchNextCards("multiple_choice", 15);
        setCards(more);
        setIndex(0);
        setSelected(null);
      })();
      return;
    }
    setIndex((i) => i + 1);
    setSelected(null);
  };

  useHotkeys({
    "1": () => card?.options && pick(card.options[0]),
    "2": () => card?.options && pick(card.options[1]),
    "3": () => card?.options && pick(card.options[2]),
    "4": () => card?.options && pick(card.options[3]),
    Enter: () => selected && next(),
    " ": () => selected && next(),
  });

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
  if (!card) return null;

  return (
    <PracticeShell
      title="Multiple choice"
      subtitle="Pick the correct form. (1-4 or click)"
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
            </div>
            <SpeakButton text={card.infinitive} />
          </div>
          <div className="text-3xl font-serif">
            <span className="text-muted-foreground">{card.pronoun}</span>{" "}
            <span className="text-muted-foreground/50">___</span>
          </div>
          <div className="grid gap-2">
            {(card.options ?? []).map((opt, i) => {
              const isCorrect = selected && opt === card.form;
              const isPickedWrong = selected === opt && opt !== card.form;
              return (
                <Button
                  key={opt}
                  variant="outline"
                  className={cn(
                    "h-auto justify-start p-4 text-left font-serif text-lg",
                    isCorrect &&
                      "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400",
                    isPickedWrong &&
                      "border-destructive/50 bg-destructive/10 text-destructive"
                  )}
                  onClick={() => pick(opt)}
                  disabled={!!selected}
                >
                  <span className="mr-3 font-mono text-xs text-muted-foreground">
                    [{i + 1}]
                  </span>
                  {opt}
                </Button>
              );
            })}
          </div>
          {selected && (
            <>
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <span>Hear it:</span>
                <SpeakButton
                  text={card.form}
                  withPronoun={
                    card.pronoun === "il/elle"
                      ? "il"
                      : card.pronoun === "ils/elles"
                        ? "ils"
                        : card.pronoun
                  }
                  variant="outline"
                  size="icon"
                />
              </div>
              <Button onClick={next} size="lg" className="w-full">
                Next (Enter)
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </PracticeShell>
  );
}
