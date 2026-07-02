"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, AlertCircle, Lightbulb } from "lucide-react";
import { PracticeShell } from "@/components/practice-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { RateButtons } from "@/components/rate-buttons";
import { SpeakButton } from "@/components/speak-button";
import { AccentBar } from "@/components/accent-bar";
import { useHotkeys } from "@/hooks/use-hotkeys";
import {
  gradeDrill,
  requestMnemonic,
  LEECH_WRONG_THRESHOLD,
} from "@/lib/client-practice";
import { cn } from "@/lib/utils";
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
  wrongCount: number;
  mnemonic: string | null;
}

const CATEGORY_COLOR: Record<PhraseCategory, string> = {
  article: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  number: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  alphabet: "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20",
  question: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
  greeting: "bg-amber-500/10 text-amber-600 dark:text-amber-500 border-amber-500/20",
  phrase: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  country: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  city: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  time: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  food: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
  fruit_vegetable: "bg-lime-500/10 text-lime-600 dark:text-lime-400 border-lime-500/20",
  meat: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  quantity: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
  nationality: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  demonstrative: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  vocabulary: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
  expression: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/20",
  activity: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
  shopping: "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20",
  colour: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  clothing: "bg-amber-500/10 text-amber-600 dark:text-amber-500 border-amber-500/20",
  weather: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  fill_article: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  fill_preposition: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  fill_question: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
  fill_phrase: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  fill_number: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  fill_time: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  fill_vocabulary: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
};

type AnswerMode = "reveal" | "type";
const MODE_STORAGE_KEY = "phrases-answer-mode";

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
  const [mode, setMode] = useState<AnswerMode>("reveal");
  const [cards, setCards] = useState<PhraseCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  // Reveal mode state
  const [revealed, setRevealed] = useState(false);
  // Type mode state
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<"answering" | "graded">("answering");
  const [feedback, setFeedback] = useState<
    "exact" | "accent-typo" | "wrong" | null
  >(null);
  // Mnemonic shown for the current card (existing or freshly generated).
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(MODE_STORAGE_KEY);
    if (saved === "type") setMode("type");
    (async () => {
      const { phrases: fetched, error: err } = await fetchNext(15);
      if (err) setError(err);
      else setCards(fetched);
    })();
  }, []);

  const card = cards?.[index];

  const switchMode = (m: AnswerMode) => {
    setMode(m);
    localStorage.setItem(MODE_STORAGE_KEY, m);
    setRevealed(false);
    setAnswer("");
    setPhase("answering");
    setFeedback(null);
    setMnemonic(null);
    if (m === "type") {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  // On a wrong answer, surface a mnemonic: use the stored one, or generate
  // one once the card has become a leech.
  const surfaceMnemonic = (c: PhraseCard) => {
    if (c.mnemonic) {
      setMnemonic(c.mnemonic);
      return;
    }
    if (c.wrongCount + 1 >= LEECH_WRONG_THRESHOLD) {
      requestMnemonic("phrase", c.id).then((m) => {
        if (m) {
          setMnemonic(m);
          c.mnemonic = m; // so the same in-session card shows it instantly
        }
      });
    }
  };

  const advance = async () => {
    if (!cards) return;
    if (index + 1 >= cards.length) {
      const { phrases: more } = await fetchNext(15);
      setCards(more);
      setIndex(0);
    } else {
      setIndex((i) => i + 1);
    }
    setRevealed(false);
    setAnswer("");
    setPhase("answering");
    setFeedback(null);
    setMnemonic(null);
    if (mode === "type") {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  // ── Reveal mode: self-rate ──
  const rate = async (rating: Rating) => {
    if (!card) return;
    try {
      await submitReview(card.id, rating);
    } catch (e) {
      console.error(e);
    }
    if (rating === 0) surfaceMnemonic(card); // fire-and-forget for next time
    await advance();
  };

  // ── Type mode: grade the typed answer ──
  const submit = async () => {
    if (!card || phase !== "answering" || answer.trim() === "") return;
    const { rating, feedback: fb } = gradeDrill(
      answer,
      card.french,
      card.repetitions
    );
    setFeedback(fb);
    setPhase("graded");
    if (card.mnemonic) setMnemonic(card.mnemonic);
    else if (rating === 0) surfaceMnemonic(card);
    try {
      await submitReview(card.id, rating);
    } catch (e) {
      console.error(e);
    }
  };

  // "I don't know" in type mode: reveal + rate Again.
  const giveUp = async () => {
    if (!card || phase !== "answering") return;
    setFeedback("wrong");
    setPhase("graded");
    surfaceMnemonic(card);
    try {
      await submitReview(card.id, 0);
    } catch (e) {
      console.error(e);
    }
  };

  useHotkeys(
    mode === "reveal"
      ? {
          " ": () => !revealed && setRevealed(true),
          Enter: () => !revealed && setRevealed(true),
          "1": () => revealed && rate(0),
          "2": () => revealed && rate(1),
          "3": () => revealed && rate(2),
          "4": () => revealed && rate(3),
        }
      : {
          Enter: () => phase === "graded" && advance(),
        }
  );

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
      subtitle={
        mode === "reveal"
          ? "Translate the English to French. (Space = reveal · 1–4 = rate)"
          : "Type the French, then Enter."
      }
      current={index + 1}
      total={cards.length}
    >
      {/* Answer-mode toggle */}
      <div className="mb-4 flex gap-2">
        <Button
          size="sm"
          variant={mode === "reveal" ? "default" : "outline"}
          onClick={() => switchMode("reveal")}
        >
          Reveal & rate
        </Button>
        <Button
          size="sm"
          variant={mode === "type" ? "default" : "outline"}
          onClick={() => switchMode("type")}
        >
          Type the answer
        </Button>
      </div>

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

          {mode === "reveal" ? (
            <>
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
                      <SpeakButton
                        text={card.french}
                        size="icon"
                        variant="outline"
                      />
                    </div>
                    {card.notes && (
                      <p className="text-sm italic text-muted-foreground">
                        {card.notes}
                      </p>
                    )}
                    {card.mnemonic && (
                      <MnemonicNote text={card.mnemonic} />
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
            </>
          ) : (
            <>
              <div className="border-t pt-6 text-left">
                <div className="mb-2 text-center text-xs uppercase tracking-wider text-muted-foreground">
                  French
                </div>
                {phase === "answering" ? (
                  <div className="space-y-3">
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
                      placeholder="Tape en français…"
                      autoFocus
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      className="h-12 text-center text-xl font-serif"
                    />
                    <AccentBar
                      inputRef={inputRef}
                      value={answer}
                      onChange={setAnswer}
                    />
                    <div className="flex gap-2">
                      <Button className="flex-1" size="lg" onClick={submit}>
                        Check (Enter)
                      </Button>
                      <Button variant="outline" size="lg" onClick={giveUp}>
                        I don&apos;t know
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <TypedResult
                      feedback={feedback}
                      answer={answer}
                      correct={card.french}
                      notes={card.notes}
                      mnemonic={mnemonic}
                    />
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <span>Hear it:</span>
                      <SpeakButton
                        text={card.french}
                        variant="outline"
                        size="icon"
                      />
                    </div>
                    <Button className="w-full" size="lg" onClick={advance}>
                      Next (Enter)
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </PracticeShell>
  );
}

function MnemonicNote({ text }: { text: string }) {
  return (
    <div className="mx-auto flex max-w-md items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-left text-sm">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <span>{text}</span>
    </div>
  );
}

function TypedResult({
  feedback,
  answer,
  correct,
  notes,
  mnemonic,
}: {
  feedback: "exact" | "accent-typo" | "wrong" | null;
  answer: string;
  correct: string;
  notes: string | null;
  mnemonic: string | null;
}) {
  const tone =
    feedback === "exact"
      ? "border-green-500/30 bg-green-500/10"
      : feedback === "accent-typo"
        ? "border-amber-500/30 bg-amber-500/10"
        : "border-destructive/30 bg-destructive/10";
  const Icon =
    feedback === "exact"
      ? CheckCircle2
      : feedback === "accent-typo"
        ? AlertCircle
        : XCircle;
  const iconTone =
    feedback === "exact"
      ? "text-green-600"
      : feedback === "accent-typo"
        ? "text-amber-500"
        : "text-destructive";
  return (
    <div className="space-y-2">
      <div className={cn("flex flex-col gap-1 rounded-lg border p-3 text-sm", tone)}>
        <div className="flex items-start gap-2">
          <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconTone)} />
          <div>
            {feedback === "exact" && <span>Exactly right! </span>}
            {feedback === "accent-typo" && (
              <span>Close — watch the accents. </span>
            )}
            {feedback === "wrong" && answer.trim() !== "" && (
              <span>
                Not quite — you wrote{" "}
                <span className="font-serif">{answer}</span>.{" "}
              </span>
            )}
            <span>
              The answer is{" "}
              <span className="font-serif text-base font-semibold">
                {correct}
              </span>
              .
            </span>
          </div>
        </div>
        {notes && (
          <div className="ml-6 text-xs italic text-muted-foreground">
            {notes}
          </div>
        )}
      </div>
      {mnemonic && <MnemonicNote text={mnemonic} />}
    </div>
  );
}
