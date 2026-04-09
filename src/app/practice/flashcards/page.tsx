"use client";
import { useEffect, useState } from "react";
import { PracticeShell } from "@/components/practice-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { RateButtons } from "@/components/rate-buttons";
import { SpeakButton } from "@/components/speak-button";
import { useHotkeys } from "@/hooks/use-hotkeys";
import {
  fetchNextCards,
  submitReview,
  type PracticeCard,
} from "@/lib/client-practice";
import type { Rating } from "@/types";

export default function FlashcardsPage() {
  const [cards, setCards] = useState<PracticeCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    (async () => {
      const { cards: fetched, error: err } = await fetchNextCards(
        "flashcards",
        15
      );
      if (err) setError(err);
      else setCards(fetched);
    })();
  }, []);

  const card = cards?.[index];

  const rate = async (rating: Rating) => {
    if (!card) return;
    try {
      await submitReview(card.cardId, rating);
    } catch (e) {
      console.error(e);
    }
    if (!cards) return;
    if (index + 1 >= cards.length) {
      const { cards: more } = await fetchNextCards("flashcards", 15);
      setCards(more);
      setIndex(0);
    } else {
      setIndex((i) => i + 1);
    }
    setRevealed(false);
  };

  useHotkeys({
    " ": () => {
      if (!revealed) setRevealed(true);
    },
    Enter: () => {
      if (!revealed) setRevealed(true);
    },
    "1": () => revealed && rate(0),
    "2": () => revealed && rate(1),
    "3": () => revealed && rate(2),
    "4": () => revealed && rate(3),
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
      title="Flashcards"
      subtitle="Recall the form, then rate yourself honestly. (Space to reveal · 1-4 to rate)"
      current={index + 1}
      total={cards.length}
    >
      <Card>
        <CardContent className="space-y-6 p-8 text-center">
          <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <span>{card.tenseLabel}</span>
            <SpeakButton text={card.infinitive} />
          </div>
          <div className="text-4xl font-serif">
            <span className="text-muted-foreground">{card.pronoun}</span>{" "}
            {revealed ? (
              <span className="text-primary animate-fade-in">{card.form}</span>
            ) : (
              <span className="text-muted-foreground/50">…</span>
            )}
          </div>
          <div className="text-sm italic text-muted-foreground">
            {card.infinitive} — {card.english}
          </div>
          {!revealed ? (
            <Button
              size="lg"
              className="w-full"
              onClick={() => setRevealed(true)}
            >
              Reveal (Space)
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-center">
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
              <RateButtons onRate={rate} />
            </div>
          )}
        </CardContent>
      </Card>
    </PracticeShell>
  );
}
