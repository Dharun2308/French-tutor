"use client";
// Smart session: one click builds a mixed session from everything due —
// verb conjugations and foundation phrases interleaved — sized to what's
// left of the daily target. Typed answers (active recall) for both.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, AlertCircle, Lightbulb, Trophy } from "lucide-react";
import { PracticeShell } from "@/components/practice-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { SpeakButton } from "@/components/speak-button";
import { AccentBar } from "@/components/accent-bar";
import { useHotkeys } from "@/hooks/use-hotkeys";
import {
  fetchNextCards,
  submitReview,
  gradeDrill,
  requestMnemonic,
  LEECH_WRONG_THRESHOLD,
  type PracticeCard,
} from "@/lib/client-practice";
import { cn } from "@/lib/utils";
import { PHRASE_CATEGORY_LABELS, type PhraseCategory, type Rating } from "@/types";

interface SmartPhrase {
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

type SmartItem =
  | { kind: "verb"; verb: PracticeCard }
  | { kind: "phrase"; phrase: SmartPhrase };

const MIN_SESSION = 6;
const MAX_SESSION = 40;

async function fetchDuePhrases(count: number): Promise<SmartPhrase[]> {
  try {
    const res = await fetch(`/api/phrases/next?count=${count}`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.phrases ?? [];
  } catch {
    return [];
  }
}

async function submitPhraseReview(phraseId: number, rating: Rating) {
  await fetch("/api/phrases/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phraseId, rating }),
  });
}

/** Interleave two lists (a, b, a, b, …), then cap at `limit`. */
function interleave(a: SmartItem[], b: SmartItem[], limit: number): SmartItem[] {
  const out: SmartItem[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max && out.length < limit; i++) {
    if (i < a.length) out.push(a[i]);
    if (out.length >= limit) break;
    if (i < b.length) out.push(b[i]);
  }
  return out;
}

export default function SmartSessionPage() {
  const [items, setItems] = useState<SmartItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<"answering" | "graded" | "done">(
    "answering"
  );
  const [feedback, setFeedback] = useState<
    "exact" | "accent-typo" | "wrong" | null
  >(null);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setItems(null);
    setIndex(0);
    setAnswer("");
    setPhase("answering");
    setFeedback(null);
    setMnemonic(null);
    setCorrectCount(0);
    try {
      // Size the session to what's left of the daily target.
      let target = 20;
      try {
        const statsRes = await fetch("/api/stats", { cache: "no-store" });
        if (statsRes.ok) {
          const s = await statsRes.json();
          target = Math.max(
            MIN_SESSION,
            Math.min(MAX_SESSION, (s.dailyTarget ?? 20) - (s.reviewedToday ?? 0))
          );
        }
      } catch {
        // stats are a nice-to-have; fall back to 20
      }

      const half = Math.ceil(target / 2);
      const [{ cards: verbCards }, duePhrases] = await Promise.all([
        fetchNextCards("drill", half),
        fetchDuePhrases(half),
      ]);
      const verbItems: SmartItem[] = (verbCards ?? []).map((v) => ({
        kind: "verb",
        verb: v,
      }));
      const phraseItems: SmartItem[] = duePhrases.map((p) => ({
        kind: "phrase",
        phrase: p,
      }));
      const mixed = interleave(phraseItems, verbItems, target);
      setItems(mixed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const item = items?.[index];
  const targetText =
    item?.kind === "verb" ? item.verb.form : item?.kind === "phrase" ? item.phrase.french : "";

  const surfaceMnemonic = (it: SmartItem) => {
    const existing = it.kind === "verb" ? it.verb.mnemonic : it.phrase.mnemonic;
    if (existing) {
      setMnemonic(existing);
      return;
    }
    const wrongCount =
      it.kind === "verb" ? it.verb.wrongCount : it.phrase.wrongCount;
    if (wrongCount + 1 >= LEECH_WRONG_THRESHOLD) {
      const kind = it.kind === "verb" ? ("card" as const) : ("phrase" as const);
      const id = it.kind === "verb" ? it.verb.cardId : it.phrase.id;
      requestMnemonic(kind, id).then((m) => {
        if (m) setMnemonic(m);
      });
    }
  };

  const submitRating = async (it: SmartItem, rating: Rating) => {
    try {
      if (it.kind === "verb") await submitReview(it.verb.cardId, rating);
      else await submitPhraseReview(it.phrase.id, rating);
    } catch (e) {
      console.error(e);
    }
  };

  const submit = async () => {
    if (!item || phase !== "answering" || answer.trim() === "") return;
    const reps = item.kind === "verb" ? item.verb.repetitions : item.phrase.repetitions;
    const { rating, feedback: fb } = gradeDrill(answer, targetText, reps);
    setFeedback(fb);
    setPhase("graded");
    if (rating >= 2) setCorrectCount((c) => c + 1);
    if (rating === 0) surfaceMnemonic(item);
    else {
      const existing =
        item.kind === "verb" ? item.verb.mnemonic : item.phrase.mnemonic;
      if (existing && rating < 2) setMnemonic(existing);
    }
    await submitRating(item, rating);
  };

  const giveUp = async () => {
    if (!item || phase !== "answering") return;
    setFeedback("wrong");
    setPhase("graded");
    surfaceMnemonic(item);
    await submitRating(item, 0);
  };

  const next = () => {
    if (!items) return;
    if (index + 1 >= items.length) {
      setPhase("done");
      return;
    }
    setIndex((i) => i + 1);
    setAnswer("");
    setPhase("answering");
    setFeedback(null);
    setMnemonic(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  useHotkeys({
    Enter: () => phase === "graded" && next(),
  });

  useEffect(() => {
    if (phase === "answering") inputRef.current?.focus();
  }, [index, phase]);

  if (error) {
    return (
      <div className="container max-w-2xl py-10">
        <EmptyState
          title="Can't build a session"
          description={error}
          actionLabel="Back to dashboard"
          actionHref="/"
        />
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
          description="Everything is resting. Come back later, or expand your active categories and tenses in Settings."
          actionLabel="Back to dashboard"
          actionHref="/"
        />
      </div>
    );
  }

  // ── Session complete ──
  if (phase === "done") {
    const pct = Math.round((correctCount / items.length) * 100);
    return (
      <div className="container max-w-2xl py-10">
        <Card>
          <CardContent className="space-y-4 p-8 text-center">
            <Trophy className="mx-auto h-10 w-10 text-amber-500" />
            <h2 className="text-2xl font-semibold">Session complete!</h2>
            <p className="text-muted-foreground">
              {correctCount} / {items.length} correct ({pct}%).{" "}
              {pct >= 80
                ? "Excellent — keep this pace."
                : "The misses come back in 10 minutes — go again to lock them in."}
            </p>
            <div className="flex justify-center gap-3">
              <Button onClick={load}>Another round</Button>
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

  return (
    <PracticeShell
      title="Smart session"
      subtitle="Everything due, mixed — type the answer, Enter to check."
      current={index + 1}
      total={items.length}
    >
      <Card>
        <CardContent className="space-y-5 p-6">
          {/* ── Prompt ── */}
          {item.kind === "verb" ? (
            <>
              <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <div>
                  {item.verb.tenseLabel} ·{" "}
                  <span className="italic normal-case">
                    {item.verb.infinitive} ({item.verb.english})
                  </span>
                  {item.verb.isIrregular && (
                    <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px]">
                      irregular
                    </span>
                  )}
                </div>
                <Badge variant="outline" className="text-[10px]">
                  verb
                </Badge>
              </div>
              <div className="flex items-baseline gap-2 text-2xl font-serif">
                <span className="text-muted-foreground">
                  {item.verb.pronoun}
                </span>
                <AnswerSlot
                  inputRef={inputRef}
                  answer={answer}
                  setAnswer={setAnswer}
                  phase={phase}
                  feedback={feedback}
                  submit={submit}
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="rounded bg-secondary px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider">
                  {PHRASE_CATEGORY_LABELS[item.phrase.category] ??
                    item.phrase.category}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  vocab
                </Badge>
              </div>
              <p className="text-lg">{item.phrase.english}</p>
              <div className="text-2xl font-serif">
                <AnswerSlot
                  inputRef={inputRef}
                  answer={answer}
                  setAnswer={setAnswer}
                  phase={phase}
                  feedback={feedback}
                  submit={submit}
                />
              </div>
            </>
          )}

          {/* ── Controls / result ── */}
          {phase === "answering" ? (
            <>
              <AccentBar inputRef={inputRef} value={answer} onChange={setAnswer} />
              <div className="flex gap-2">
                <Button className="flex-1" size="lg" onClick={submit}>
                  Check (Enter)
                </Button>
                <Button variant="outline" size="lg" onClick={giveUp}>
                  I don&apos;t know
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <ResultBanner
                feedback={feedback}
                correct={targetText}
                notes={item.kind === "phrase" ? item.phrase.notes : null}
                mnemonic={mnemonic}
              />
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <span>Hear it:</span>
                <SpeakButton text={targetText} variant="outline" size="icon" />
              </div>
              <Button onClick={next} className="w-full" size="lg">
                {index + 1 >= items.length ? "Finish" : "Next"} (Enter)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </PracticeShell>
  );
}

// ── Small shared pieces ──

function AnswerSlot({
  inputRef,
  answer,
  setAnswer,
  phase,
  feedback,
  submit,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  answer: string;
  setAnswer: (v: string) => void;
  phase: "answering" | "graded" | "done";
  feedback: "exact" | "accent-typo" | "wrong" | null;
  submit: () => void;
}) {
  if (phase !== "answering") {
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
        {answer || "—"}
      </span>
    );
  }
  return (
    <span className="flex-1 border-b border-dashed border-muted-foreground/40 pb-1">
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
    </span>
  );
}

function ResultBanner({
  feedback,
  correct,
  notes,
  mnemonic,
}: {
  feedback: "exact" | "accent-typo" | "wrong" | null;
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
            {feedback === "accent-typo" && <span>Close — watch the accents. </span>}
            {feedback === "wrong" && <span>Not quite. </span>}
            <span>
              The answer is{" "}
              <span className="font-serif text-base font-semibold">{correct}</span>.
            </span>
          </div>
        </div>
        {notes && (
          <div className="ml-6 text-xs italic text-muted-foreground">{notes}</div>
        )}
      </div>
      {mnemonic && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-left text-sm">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>{mnemonic}</span>
        </div>
      )}
    </div>
  );
}
