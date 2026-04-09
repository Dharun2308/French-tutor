"use client";
import { useEffect, useState } from "react";
import { PracticeShell } from "@/components/practice-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { RateButtons } from "@/components/rate-buttons";
import { SpeakButton } from "@/components/speak-button";
import { useHotkeys } from "@/hooks/use-hotkeys";
import {
  PHRASE_CATEGORY_LABELS,
  type PhraseCategory,
  type Rating,
} from "@/types";

interface PhraseCard {
  id: number;
  category: PhraseCategory;
  french: string;
  english: string;
  notes: string | null;
  level: string;
  repetitions: number;
}

const CATEGORY_COLOR: Record<PhraseCategory, string> = {
  article: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  number: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  alphabet: "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20",
  question: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
  greeting: "bg-amber-500/10 text-amber-600 dark:text-amber-500 border-amber-500/20",
  phrase: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
};

async function fetchNext(count = 15): Promise<{
  phrases: PhraseCard[];
  error?: string;
}> {
  try {
    const res = await fetch(`/api/phrases/next?count=${count}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { phrases: [], error: body.error ?? `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { phrases: data.phrases };
  } catch (err) {
    return {
      phrases: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function submitReview(phraseId: number, rating: Rating) {
  await fetch("/api/phrases/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phraseId, rating }),
  });
}

export default function PhrasesPage() {
  const [cards, setCards] = useState<PhraseCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    (async () => {
      const { phrases: fetched, error: err } = await fetchNext(15);
      if (err) setError(err);
      else setCards(fetched);
    })();
  }, []);

  const card = cards?.[index];

  const rate = async (rating: Rating) => {
    if (!card) return;
    try {
      await submitReview(card.id, rating);
    } catch (e) {
      console.error(e);
    }
    if (!cards) return;
    if (index + 1 >= cards.length) {
      const { phrases: more } = await fetchNext(15);
      setCards(more);
      setIndex(0);
    } else {
      setIndex((i) => i + 1);
    }
    setRevealed(false);
  };

  useHotkeys({
    " ": () => !revealed && setRevealed(true),
    Enter: () => !revealed && setRevealed(true),
    "1": () => revealed && rate(0),
    "2": () => revealed && rate(1),
    "3": () => revealed && rate(2),
    "4": () => revealed && rate(3),
  });

  if (error) {
    return (
      <div className="container max-w-2xl py-10">
        <EmptyState
          title="Can't load phrases"
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
          title="Nothing due 🎉"
          description="All your foundation cards are resting. Try again later, or expand your active categories in Settings."
          actionLabel="Back to dashboard"
          actionHref="/"
        />
      </div>
    );
  }
  if (!card) return null;

  return (
    <PracticeShell
      title="Foundations"
      subtitle="Translate the English to French. (Space = reveal · 1–4 = rate)"
      current={index + 1}
      total={cards.length}
    >
      <Card>
        <CardContent className="space-y-6 p-8 text-center">
          <div className="flex items-center justify-center gap-2">
            <Badge
              variant="outline"
              className={`border ${CATEGORY_COLOR[card.category]}`}
            >
              {PHRASE_CATEGORY_LABELS[card.category]}
            </Badge>
          </div>
          <div>
            <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
              English
            </div>
            <p className="text-xl">{card.english}</p>
          </div>
          <div className="border-t pt-6">
            <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
              French
            </div>
            {revealed ? (
              <div className="animate-fade-in space-y-3">
                <div className="flex items-center justify-center gap-2">
                  <p className="text-3xl font-serif text-primary">
                    {card.french}
                  </p>
                  <SpeakButton text={card.french} size="icon" variant="outline" />
                </div>
                {card.notes && (
                  <p className="text-sm italic text-muted-foreground">
                    {card.notes}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-3xl text-muted-foreground/40">…</p>
            )}
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
            <RateButtons onRate={rate} />
          )}
        </CardContent>
      </Card>
    </PracticeShell>
  );
}
