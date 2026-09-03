"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TutorUsageOutcome } from "@/types";

interface ActiveItem {
  id: number;
  position: number;
  french: string;
  english: string;
  exampleFr: string;
  exampleEn: string;
  type: string;
  sourceContext: string;
}

interface ActiveResponse {
  weekStart: string;
  items: ActiveItem[];
}

const OUTCOMES: Array<{ value: TutorUsageOutcome; label: string }> = [
  { value: "natural", label: "Used naturally" },
  { value: "helped", label: "Used with help" },
  { value: "not_used", label: "Didn't use" },
];

export default function TutorModePage() {
  const [active, setActive] = useState<ActiveResponse | null>(null);
  const [outcomes, setOutcomes] = useState<Record<number, TutorUsageOutcome>>({});
  const [checkIn, setCheckIn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ natural: number; helped: number; not_used: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submissionId = useRef("");

  useEffect(() => {
    fetch("/api/active-items", { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setActive(body);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const marked = useMemo(() => Object.keys(outcomes).length, [outcomes]);

  const save = async () => {
    if (!active || marked === 0) return;
    setSaving(true);
    setError(null);
    if (!submissionId.current) submissionId.current = crypto.randomUUID();
    try {
      const res = await fetch("/api/tutor/usage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          submissionId: submissionId.current,
          weekStart: active.weekStart,
          entries: Object.entries(outcomes).map(([itemId, outcome]) => ({
            itemId: Number(itemId),
            outcome,
          })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setSaved(body.outcomes);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (error && !active) {
    return <div className="container max-w-2xl py-10 text-destructive">{error}</div>;
  }
  if (!active) {
    return <div className="container max-w-2xl py-10"><div className="h-48 animate-pulse rounded-xl bg-muted" /></div>;
  }
  if (saved) {
    return (
      <div className="container max-w-xl py-12">
        <Card className="text-center">
          <CardContent className="py-10">
            <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
            <h1 className="mt-4 text-2xl font-semibold">Lesson feedback saved</h1>
            <p className="mt-2 text-muted-foreground">
              {saved.natural} natural · {saved.helped} with help · {saved.not_used} not used
            </p>
            <Button asChild className="mt-6"><Link href="/weak">Back to Weak French</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-8">
      <Link href="/weak" className="mb-5 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Weak French
      </Link>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-3xl font-semibold"><MessageSquare className="h-7 w-7" />Tutor Mode</h1>
        <p className="mt-2 rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed">
          Please create natural opportunities for me to use these expressions. Give me time to produce
          them before prompting, and correct me normally if I need help.
        </p>
      </div>

      {active.items.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Import lesson notes to build an Active 10.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {active.items.map((item) => (
            <Card key={item.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  <span className="mt-1 w-5 shrink-0 text-xs text-muted-foreground">{item.position}</span>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="font-serif text-xl font-medium">{item.french}</CardTitle>
                    <CardDescription className="mt-1">{item.english}</CardDescription>
                  </div>
                  <Badge variant="secondary">{item.type}</Badge>
                </div>
              </CardHeader>
              <CardContent className="pl-10">
                {(item.exampleFr || item.sourceContext) && (
                  <div className="mb-3 text-sm">
                    {item.exampleFr && <p className="font-serif">{item.exampleFr}</p>}
                    {item.exampleEn && <p className="text-muted-foreground">{item.exampleEn}</p>}
                    {!item.exampleFr && item.sourceContext && <p className="text-muted-foreground">From the lesson: {item.sourceContext}</p>}
                  </div>
                )}
                {checkIn && (
                  <div className="grid grid-cols-3 gap-2">
                    {OUTCOMES.map((choice) => (
                      <button
                        key={choice.value}
                        type="button"
                        onClick={() => setOutcomes((old) => ({ ...old, [item.id]: choice.value }))}
                        className={cn(
                          "min-h-11 rounded-md border px-2 py-2 text-xs font-medium transition-colors",
                          outcomes[item.id] === choice.value
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-background hover:bg-accent"
                        )}
                      >
                        {choice.label}
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {active.items.length > 0 && (
        <div className="sticky bottom-3 mt-6 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
          {!checkIn ? (
            <Button size="lg" className="w-full" onClick={() => setCheckIn(true)}>Start lesson check-in</Button>
          ) : (
            <>
              {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
              <Button size="lg" className="w-full" disabled={saving || marked === 0} onClick={save}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save lesson feedback {marked > 0 ? `(${marked})` : ""}
              </Button>
              <p className="mt-2 text-center text-xs text-muted-foreground">Unmarked items are skipped.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
