"use client";
// Approve / edit / delete what the extractor proposed, then save. This is the
// only path into learning_items. Keyed by ?batch= so a killed phone tab costs
// nothing — reopen and everything is still here.

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Merge,
  Pencil,
  Star,
  Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  ITEM_CEFR_LEVELS,
  LEARNING_ITEM_TYPES,
  LEARNING_ITEM_TYPE_LABELS,
  type ItemCefrLevel,
  type LearningItemType,
} from "@/types";

interface DuplicateHit {
  kind: "item" | "phrase";
  id: number;
  french: string;
  english: string;
  exact: boolean;
  encounterCount?: number;
}

interface ReviewItem {
  french: string;
  english: string;
  example_fr: string;
  example_en: string;
  type: LearningItemType;
  grammar_topic: string;
  cefr_level: ItemCefrLevel;
  priority: number;
  confidence: number;
  source_context: string;
  handwriting_note: string;
  duplicates: DuplicateHit[];
}

interface BatchDetail {
  id: number;
  createdAt: string;
  sourceKind: string;
  status: "pending" | "reviewed" | "discarded";
  itemCount: number;
  label: string | null;
  imageCount: number;
  rawText: string | null;
  model: string | null;
  providerLog: { provider: string; ok: boolean; ms: number; model: string | null; error: string | null }[];
  extractError: string | null;
  extraction: { lesson_summary: string; items: ReviewItem[] } | null;
}

const PROVIDER_SHORT: Record<string, string> = {
  codex: "Codex",
  claude: "Claude",
  openai: "OpenAI API",
};

interface Draft extends ReviewItem {
  key: string;
  selected: boolean;
  editing: boolean;
}

interface CommitResult {
  inserted: number;
  merged: number;
  results: { french: string; action: "inserted" | "merged"; id: number }[];
}

const TYPE_STYLE: Record<LearningItemType, string> = {
  correction: "bg-red-500/15 text-red-700 dark:text-red-300",
  phrase: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  vocabulary: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  grammar: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  pronunciation: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
};

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export default function ReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="container max-w-2xl py-16 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        </div>
      }
    >
      <ReviewInner />
    </Suspense>
  );
}

function ReviewInner() {
  const params = useSearchParams();
  const batchId = Number(params.get("batch"));

  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [showImages, setShowImages] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const load = () =>
    fetch(`/api/import/batches?id=${batchId}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
        const b = d as BatchDetail;
        setBatch(b);
        setDrafts(
          (b.extraction?.items ?? []).map((it, i) => ({
            ...it,
            key: String(i),
            selected: true,
            editing: false,
          }))
        );
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

  useEffect(() => {
    if (!Number.isInteger(batchId) || batchId <= 0) {
      setError("Missing import id.");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const retry = async () => {
    setRetrying(true);
    setError(null);
    try {
      const res = await fetch("/api/import/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ batchId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await load();
    } finally {
      setRetrying(false);
    }
  };

  const update = (key: string, patch: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const remove = (key: string) =>
    setDrafts((ds) => ds.filter((d) => d.key !== key));

  const selected = drafts.filter((d) => d.selected);

  const save = async () => {
    if (selected.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          batchId,
          items: selected.map((d) => ({
            french: d.french,
            english: d.english,
            example_fr: d.example_fr,
            example_en: d.example_en,
            type: d.type,
            grammar_topic: d.grammar_topic,
            cefr_level: d.cefr_level,
            priority: d.priority,
            source_context: d.source_context,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as CommitResult);
      setBatch((b) => (b ? { ...b, status: "reviewed" } : b));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const discard = async () => {
    if (!window.confirm("Discard this import? Nothing will be saved.")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/import/batches", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: batchId, status: "discarded" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setBatch((b) => (b ? { ...b, status: "discarded" } : b));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // ── States ──
  if (error && !batch) {
    return (
      <Shell title="Review import">
        <ErrorBox message={error} />
      </Shell>
    );
  }
  if (!batch) {
    return (
      <Shell title="Review import">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </Shell>
    );
  }

  if (result) {
    return (
      <Shell title="Saved" subtitle={batch.label ?? undefined}>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-success/15">
                <Check className="h-5 w-5 text-success" />
              </div>
              <div>
                <div className="font-medium">
                  {result.inserted} new item{result.inserted === 1 ? "" : "s"}
                  {result.merged > 0 &&
                    ` · ${result.merged} merged into existing`}
                </div>
                <div className="text-xs text-muted-foreground">
                  They start showing up in your reviews from the next session.
                </div>
              </div>
            </div>
            <ul className="mt-4 space-y-1 text-sm">
              {result.results.map((r) => (
                <li key={`${r.action}-${r.id}`} className="flex items-center gap-2">
                  {r.action === "merged" ? (
                    <Merge className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <Check className="h-3.5 w-3.5 text-success" />
                  )}
                  <span className="truncate">{r.french}</span>
                  {r.action === "merged" && (
                    <span className="text-xs text-muted-foreground">merged</span>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <Button variant="outline" asChild>
                <Link href="/import">Import another</Link>
              </Button>
              <Button asChild>
                <Link href="/">Dashboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (batch.status === "reviewed") {
    return (
      <Shell title="Already saved" subtitle={batch.label ?? undefined}>
        <Card>
          <CardContent className="p-6 text-sm">
            This import was saved with {batch.itemCount} item
            {batch.itemCount === 1 ? "" : "s"}.
            <div className="mt-4">
              <Button variant="outline" asChild>
                <Link href="/import">Back to imports</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (batch.status === "discarded") {
    return (
      <Shell title="Discarded" subtitle={batch.label ?? undefined}>
        <Card>
          <CardContent className="p-6 text-sm">
            This import was discarded. Nothing was saved.
            <div className="mt-4">
              <Button variant="outline" asChild>
                <Link href="/import">Back to imports</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // ── Pending but extraction failed: keep the photos, offer Retry ──
  if (batch.extractError) {
    return (
      <Shell title="Extraction failed" subtitle={batch.label ?? undefined}>
        <Card className="border-destructive/40">
          <CardContent className="p-5">
            <p className="flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span>
                Your photos are saved — nothing was lost. Every enabled
                provider failed:
              </span>
            </p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {batch.providerLog.map((a, i) => (
                <li key={i} className="flex items-start gap-2">
                  {a.ok ? (
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                  ) : (
                    <span className="mt-0.5 inline-block h-3.5 w-3.5 shrink-0 rounded-full bg-destructive/80" />
                  )}
                  <span>
                    <span className="font-medium">{PROVIDER_SHORT[a.provider] ?? a.provider}</span>
                    {a.model && <span className="text-muted-foreground"> · {a.model}</span>}
                    {": "}
                    <span className={a.ok ? "" : "text-destructive"}>{a.ok ? "ok" : a.error}</span>
                  </span>
                </li>
              ))}
              {batch.providerLog.length === 0 && (
                <li className="text-destructive">{batch.extractError}</li>
              )}
            </ul>
            {error && <ErrorBox message={error} />}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="outline" disabled={retrying} onClick={discard}>
                Discard
              </Button>
              <Button disabled={retrying} onClick={retry}>
                {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Retry extraction
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Check or switch providers in{" "}
              <Link href="/settings#providers" className="underline">
                Settings → Lesson note extraction
              </Link>
              .
            </p>
          </CardContent>
        </Card>
        {batch.imageCount > 0 && (
          <div className="mt-4 space-y-2">
            {Array.from({ length: batch.imageCount }).map((_, n) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={n}
                src={`/api/import/image?batch=${batch.id}&n=${n}`}
                alt={`Notebook page ${n + 1}`}
                className="w-full rounded-md border"
              />
            ))}
          </div>
        )}
      </Shell>
    );
  }

  const fallbackNote = (() => {
    const failed = batch.providerLog.filter((a) => !a.ok);
    const winner = batch.providerLog.find((a) => a.ok);
    if (failed.length === 0 || !winner) return null;
    return `${failed.map((a) => `${PROVIDER_SHORT[a.provider] ?? a.provider} failed (${a.error})`).join("; ")} — extracted with ${PROVIDER_SHORT[winner.provider] ?? winner.provider} instead.`;
  })();

  // ── Pending: the approval list ──
  return (
    <Shell
      title="Review items"
      subtitle={batch.extraction?.lesson_summary || batch.label || undefined}
      padBottom
    >
      {batch.imageCount > 0 && (
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setShowImages((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {showImages ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            {showImages ? "Hide" : "Show"} notebook photo
            {batch.imageCount === 1 ? "" : "s"} ({batch.imageCount})
          </button>
          {showImages && (
            <div className="mt-2 space-y-2">
              {Array.from({ length: batch.imageCount }).map((_, n) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={n}
                  src={`/api/import/image?batch=${batch.id}&n=${n}`}
                  alt={`Notebook page ${n + 1}`}
                  className="w-full rounded-md border"
                />
              ))}
            </div>
          )}
        </div>
      )}

      {fallbackNote && (
        <p className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{fallbackNote}</span>
        </p>
      )}
      {batch.model && !fallbackNote && (
        <p className="mb-3 text-[11px] text-muted-foreground">
          Extracted by {PROVIDER_SHORT[batch.model.split(":")[0]] ?? batch.model.split(":")[0]} · {batch.model.split(":")[1]}
        </p>
      )}

      {error && <ErrorBox message={error} />}

      {drafts.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            The extractor found nothing worth keeping in these notes.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {drafts.map((d, i) => (
            <ItemCard
              key={d.key}
              draft={d}
              index={i}
              onChange={(patch) => update(d.key, patch)}
              onRemove={() => remove(d.key)}
            />
          ))}
        </div>
      )}

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex max-w-2xl items-center gap-2 py-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={discard}
          >
            Discard
          </Button>
          <div className="flex-1" />
          <Button
            size="lg"
            disabled={saving || selected.length === 0}
            onClick={save}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Add {selected.length} selected item{selected.length === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
    </Shell>
  );
}

// ── Pieces ──

function Shell({
  title,
  subtitle,
  padBottom,
  children,
}: {
  title: string;
  subtitle?: string;
  padBottom?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("container max-w-2xl py-8", padBottom && "pb-28")}>
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/import">
            <ArrowLeft className="h-4 w-4" />
            Imports
          </Link>
        </Button>
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

function Stars({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center" role="radiogroup" aria-label="Priority">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`Priority ${n}`}
          onClick={() => onChange(n)}
          className="p-0.5"
        >
          <Star
            className={cn(
              "h-4 w-4",
              n <= value
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground/40"
            )}
          />
        </button>
      ))}
    </div>
  );
}

function ItemCard({
  draft: d,
  index,
  onChange,
  onRemove,
}: {
  draft: Draft;
  index: number;
  onChange: (patch: Partial<Draft>) => void;
  onRemove: () => void;
}) {
  const exactItem = d.duplicates.find((h) => h.exact && h.kind === "item");
  const exactPhrase = d.duplicates.find((h) => h.exact && h.kind === "phrase");
  const loose = d.duplicates.filter((h) => !h.exact);

  return (
    <Card className={cn(!d.selected && "opacity-60")}>
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-center gap-3">
          <Checkbox
            checked={d.selected}
            onChange={(e) => onChange({ selected: e.target.checked })}
            aria-label={`Include item ${index + 1}`}
          />
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              TYPE_STYLE[d.type]
            )}
          >
            {LEARNING_ITEM_TYPE_LABELS[d.type]}
          </span>
          <Stars value={d.priority} onChange={(n) => onChange({ priority: n })} />
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={d.editing ? "Done editing" : "Edit"}
            onClick={() => onChange({ editing: !d.editing })}
          >
            {d.editing ? (
              <Check className="h-4 w-4" />
            ) : (
              <Pencil className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            aria-label="Delete item"
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Body */}
        {d.editing ? (
          <div className="mt-3 space-y-2">
            <Input
              value={d.french}
              onChange={(e) => onChange({ french: e.target.value })}
              placeholder="French"
              lang="fr"
              className="text-base font-medium"
            />
            <Input
              value={d.english}
              onChange={(e) => onChange({ english: e.target.value })}
              placeholder="English meaning"
            />
            <Textarea
              value={d.example_fr}
              onChange={(e) => onChange({ example_fr: e.target.value })}
              placeholder="Example sentence (French)"
              lang="fr"
              rows={2}
            />
            <Input
              value={d.example_en}
              onChange={(e) => onChange({ example_en: e.target.value })}
              placeholder="Example sentence (English)"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                className={selectClass}
                value={d.type}
                onChange={(e) =>
                  onChange({ type: e.target.value as LearningItemType })
                }
                aria-label="Type"
              >
                {LEARNING_ITEM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {LEARNING_ITEM_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              <select
                className={selectClass}
                value={d.cefr_level}
                onChange={(e) =>
                  onChange({ cefr_level: e.target.value as ItemCefrLevel })
                }
                aria-label="CEFR level"
              >
                {ITEM_CEFR_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <Input
              value={d.grammar_topic}
              onChange={(e) => onChange({ grammar_topic: e.target.value })}
              placeholder="Grammar topic (optional)"
            />
          </div>
        ) : (
          <div className="mt-3">
            <div className="text-lg font-medium leading-snug" lang="fr">
              {d.french}
            </div>
            <div className="text-sm text-muted-foreground">{d.english}</div>
            {d.example_fr && (
              <div className="mt-2 rounded-md bg-muted/60 px-3 py-2">
                <div className="text-sm" lang="fr">
                  {d.example_fr}
                </div>
                {d.example_en && (
                  <div className="text-xs text-muted-foreground">
                    {d.example_en}
                  </div>
                )}
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span>{d.cefr_level}</span>
              {d.grammar_topic && <span>{d.grammar_topic}</span>}
              {d.source_context && (
                <span className="italic">from: {d.source_context}</span>
              )}
              {d.confidence < 0.7 && (
                <Badge variant="outline" className="text-[10px]">
                  low confidence
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Flags */}
        {d.handwriting_note && (
          <p className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Unclear handwriting: {d.handwriting_note}</span>
          </p>
        )}
        {exactItem && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Merge className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Already saved{" "}
              {exactItem.encounterCount
                ? `(seen ${exactItem.encounterCount}×)`
                : ""}{" "}
              — adding will merge, not duplicate.
            </span>
          </p>
        )}
        {exactPhrase && !exactItem && (
          <p className="mt-2 text-xs text-muted-foreground">
            Also in Foundations as “{exactPhrase.french}” — keep it if the
            tutor's context adds something.
          </p>
        )}
        {loose.length > 0 && !exactItem && (
          <p className="mt-2 text-xs text-muted-foreground">
            Similar (accents differ): {loose.map((h) => `“${h.french}”`).join(", ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
