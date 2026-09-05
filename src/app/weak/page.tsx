"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clock3, Loader2, Pin, PinOff, RefreshCw, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface WeakItem {
  id: number;
  french: string;
  english: string;
  type: string;
  priority: number;
  score: number;
  reasons: string[];
}

interface ActiveItem extends WeakItem {
  selectionId: number;
  position: number;
  pinned: boolean;
  source: string;
}

interface ActiveResponse {
  weekStart: string;
  items: ActiveItem[];
}

interface ErrorPattern {
  key: string;
  errorType: string;
  grammarTopic: string;
  count: number;
  totalCount: number;
  examples: Array<{ itemId: number; french: string; attempt: string | null; corrected: string | null }>;
}

const ERROR_LABELS: Record<string, string> = {
  accent: "Accents",
  conjugation: "Conjugation",
  tense: "Tense choice",
  agreement: "Agreement",
  article: "Articles",
  preposition: "Prepositions",
  negation: "Negation",
  word_order: "Word order",
  vocabulary: "Vocabulary",
  register: "Register",
  other: "Other recurring error",
};

export default function WeakFrenchPage() {
  const [weak, setWeak] = useState<WeakItem[] | null>(null);
  const [active, setActive] = useState<ActiveResponse | null>(null);
  const [patterns, setPatterns] = useState<ErrorPattern[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = async () => {
    setError(null);
    try {
      const [weakRes, activeRes, patternRes] = await Promise.all([
        fetch("/api/items/weak", { cache: "no-store" }),
        fetch("/api/active-items", { cache: "no-store" }),
        fetch("/api/error-patterns", { cache: "no-store" }),
      ]);
      const [weakBody, activeBody, patternBody] = await Promise.all([
        weakRes.json(),
        activeRes.json(),
        patternRes.json(),
      ]);
      if (!weakRes.ok) throw new Error(weakBody.error ?? `Weak items: HTTP ${weakRes.status}`);
      if (!activeRes.ok) throw new Error(activeBody.error ?? `Active 10: HTTP ${activeRes.status}`);
      if (!patternRes.ok) throw new Error(patternBody.error ?? `Errors: HTTP ${patternRes.status}`);
      setWeak(weakBody.items ?? []);
      setActive(activeBody);
      setPatterns(patternBody.patterns ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const activeIds = useMemo(() => new Set(active?.items.map((item) => item.id) ?? []), [active]);
  const otherWeak = (weak ?? []).filter((item) => !activeIds.has(item.id)).slice(0, 10);

  const change = async (action: "pin" | "unpin" | "replace", itemId: number) => {
    setBusy(itemId);
    setError(null);
    try {
      const res = await fetch("/api/active-items", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, itemId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setActive(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  if (!weak || !active) {
    return (
      <div className="container max-w-3xl py-10">
        {error ? (
          <Card className="border-destructive/40"><CardContent className="py-6 text-destructive">{error}</CardContent></Card>
        ) : (
          <div className="h-48 animate-pulse rounded-xl bg-muted" />
        )}
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-8">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            <Target className="h-6 w-6 text-rose-600 sm:h-7 sm:w-7" /> Weak French
          </h1>
          <p className="mt-1 text-muted-foreground">The personal French worth targeting now.</p>
        </div>
        <Button asChild size="sm"><Link href="/practice/focus"><Clock3 className="h-4 w-4" />Practice</Link></Button>
      </div>

      {error && (
        <p className="mb-4 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Active {active.items.length}</CardTitle>
          <CardDescription>
            These phrases appear automatically in Focus and Smart sessions. The list refreshes Monday; pinned items carry forward.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {active.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Import lesson notes to create your first focus list.</p>
          ) : active.items.map((item) => (
            <div key={item.id} className="rounded-lg border p-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 w-5 shrink-0 text-xs font-medium text-muted-foreground">{item.position}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-serif text-lg leading-snug">{item.french}</div>
                  <div className="text-sm text-muted-foreground">{item.english}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.reasons.map((reason) => <Badge key={reason} variant="secondary">{reason}</Badge>)}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant={item.pinned ? "secondary" : "ghost"}
                  disabled={busy !== null}
                  aria-label={item.pinned ? `Unpin ${item.french}` : `Pin ${item.french}`}
                  onClick={() => change(item.pinned ? "unpin" : "pin", item.id)}
                >
                  {busy === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : item.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                </Button>
              </div>
              {!item.pinned && otherWeak.length > 0 && (
                <button
                  className="ml-8 mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
                  disabled={busy !== null}
                  onClick={() => change("replace", item.id)}
                >
                  <RefreshCw className="h-3 w-3" /> Replace this pick
                </button>
              )}
            </div>
          ))}
          <details className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">Why these?</summary>
            <p className="mt-2">
              Active 10 balances fading recall, recent misses, tutor corrections, conversational usefulness,
              and phrases you have already used naturally. It never changes your FSRS due dates.
            </p>
          </details>
        </CardContent>
      </Card>

      {patterns.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Recurring errors</h2>
          <p className="mt-1 text-sm text-muted-foreground">Repeated patterns from the last 30 days.</p>
          <div className="mt-3 space-y-3">
            {patterns.map((pattern) => (
              <Card key={pattern.key}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">
                      {pattern.grammarTopic || ERROR_LABELS[pattern.errorType] || pattern.errorType}
                    </div>
                    <Badge variant="destructive">{pattern.count} recent</Badge>
                  </div>
                  <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {pattern.examples.map((example, index) => (
                      <div key={`${example.itemId}-${index}`}>
                        {example.attempt ? <><span className="line-through">{example.attempt}</span>{" → "}</> : null}
                        <span className="text-foreground">{example.corrected || example.french}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {otherWeak.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Other weak items</h2>
          <div className="mt-3 space-y-2">
            {otherWeak.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <div className="font-serif text-base">{item.french}</div>
                  <div className="truncate text-sm text-muted-foreground">{item.english}</div>
                </div>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => change("pin", item.id)}>
                  {busy === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pin className="h-4 w-4" />} Pin
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
