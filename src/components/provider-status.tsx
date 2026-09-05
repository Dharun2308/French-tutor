"use client";
// Provider health UI, two sizes:
//   <ProviderSettings/> — Settings page: on/off per provider, last result, Test button
//   <ProviderStrip/>    — Import page: one line, red if the last run failed
// Both read /api/ai/providers. Toggles save immediately (PUT /api/settings),
// independent of the page's main Save button.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { ProviderId } from "@/types";

interface LastEvent {
  ok: boolean;
  at: string;
  ms: number;
  model: string | null;
  error: string | null;
  purpose: string;
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  enabled: boolean;
  installed: boolean;
  last: LastEvent | null;
}

function useProviders() {
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/providers", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setProviders(d.providers ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { providers, error, reload, setProviders };
}

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

function short(label: string): string {
  return label.split(" (")[0];
}

/** True when nothing enabled can be expected to work. */
export function providersLookBroken(ps: ProviderInfo[]): boolean {
  const on = ps.filter((p) => p.enabled);
  if (on.length === 0) return true;
  return on.every((p) => !p.installed || (p.last !== null && !p.last.ok));
}

// ── Import page strip ──

export function ProviderStrip() {
  const { providers, error } = useProviders();
  if (error || !providers) return null;
  const broken = providersLookBroken(providers);
  return (
    <div
      className={cn(
        "mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-xs",
        broken
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border bg-muted/40 text-muted-foreground"
      )}
    >
      {broken && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
      {providers.map((p) => (
        <span key={p.id} className="inline-flex items-center gap-1">
          {!p.enabled ? (
            <span className="opacity-60">{short(p.label)} off</span>
          ) : !p.installed ? (
            <>
              <XCircle className="h-3 w-3 text-destructive" />
              {short(p.label)} not installed
            </>
          ) : p.last === null ? (
            <span>{short(p.label)} untested</span>
          ) : p.last.ok ? (
            <>
              <CheckCircle2 className="h-3 w-3 text-green-600" />
              {short(p.label)} {Math.round(p.last.ms / 1000)}s · {ago(p.last.at)}
            </>
          ) : (
            <>
              <XCircle className="h-3 w-3 text-destructive" />
              {short(p.label)} failed {ago(p.last.at)}
            </>
          )}
        </span>
      ))}
      <Link href="/settings#providers" className="ml-auto underline underline-offset-2">
        Settings
      </Link>
    </div>
  );
}

// ── Settings section ──

export function ProviderSettings() {
  const { providers, error, reload, setProviders } = useProviders();
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; ms: number; error: string | null }>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash === "#providers" && detailsRef.current) {
        detailsRef.current.open = true;
      }
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  const toggle = async (id: ProviderId, enabled: boolean) => {
    setSaveError(null);
    setProviders((ps) => ps?.map((p) => (p.id === id ? { ...p, enabled } : p)) ?? ps);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ extractProviders: { [id]: enabled } }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
      reload();
    }
  };

  const test = async (id: ProviderId) => {
    setBusy(id);
    try {
      const res = await fetch("/api/ai/providers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: id }),
      });
      const d = await res.json().catch(() => ({}));
      const a = d.attempt ?? { ok: false, ms: 0, error: d.error ?? `HTTP ${res.status}` };
      setTestResult((t) => ({ ...t, [id]: { ok: a.ok, ms: a.ms, error: a.error ?? null } }));
    } catch (e) {
      setTestResult((t) => ({
        ...t,
        [id]: { ok: false, ms: 0, error: e instanceof Error ? e.message : String(e) },
      }));
    } finally {
      setBusy(null);
      reload();
    }
  };

  return (
    <Card id="providers">
      <details ref={detailsRef} className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 [&::-webkit-details-marker]:hidden">
          <div>
            <p className="font-semibold">AI providers</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Codex first, Claude second, OpenAI API as the final fallback.
            </p>
          </div>
          <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
      <CardContent className="space-y-3 border-t pt-5">
        <p className="text-xs text-muted-foreground">
          Used for notebook extraction, grading, conversations, and summaries.
          Codex and Claude use your subscriptions; OpenAI bills the API per call.
          Premium speech is controlled separately above.
        </p>
        {error && (
          <p className="text-sm text-destructive">Could not load provider status: {error}</p>
        )}
        {saveError && <p className="text-sm text-destructive">{saveError}</p>}
        {providers && providersLookBroken(providers) && (
          <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Nothing enabled is currently working. Imports and AI grading
              will fail until one of these is fixed or switched on.
            </span>
          </p>
        )}
        {providers?.map((p) => {
          const t = testResult[p.id];
          return (
            <div key={p.id} className="rounded-md border p-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={p.enabled}
                  onChange={(e) => toggle(p.id, e.target.checked)}
                  aria-label={`Enable ${p.label}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{p.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {!p.installed ? (
                      <span className="text-destructive">Not installed / no key on this machine</span>
                    ) : p.last === null ? (
                      "Never used"
                    ) : p.last.ok ? (
                      <>
                        Last {p.last.purpose}: ok in {Math.round(p.last.ms / 1000)}s
                        {p.last.model && ` · ${p.last.model}`} · {ago(p.last.at)}
                      </>
                    ) : (
                      <span className="break-words text-destructive [overflow-wrap:anywhere]">
                        Last {p.last.purpose} failed {ago(p.last.at)}: {p.last.error}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null || !p.installed}
                  onClick={() => test(p.id)}
                >
                  {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Test"}
                </Button>
              </div>
              {t && (
                <div
                  className={cn(
                    "mt-2 flex items-start gap-1.5 text-xs",
                    t.ok ? "text-green-600" : "text-destructive"
                  )}
                >
                  {t.ok ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                    {t.ok ? `Working — replied in ${Math.round(t.ms / 1000)}s` : t.error}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
      </details>
    </Card>
  );
}
