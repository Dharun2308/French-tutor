"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SpeakButton } from "@/components/speak-button";
import { RateButtons } from "@/components/rate-buttons";
import type { Rating } from "@/types";

interface Candidate { id: number; french: string; english: string; failureCount: number }
interface Variation { id: number; itemId: number; promptEn: string; targetFr: string; note: string }

export default function VariationsPage() {
  const [items, setItems] = useState<Candidate[] | null>(null);
  const [index, setIndex] = useState(0);
  const [variation, setVariation] = useState<Variation | null>(null);
  const [answer, setAnswer] = useState("");
  const [grade, setGrade] = useState<{ verdict: string; errorType: string; corrected: string; reason: string; gradedBy: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const item = items?.[index];
  useEffect(() => { fetch("/api/ai/item-variation").then((r) => r.json()).then((d) => setItems(d.items ?? [])).catch((e) => setError(String(e))); }, []);
  const generate = async (regenerate = false) => {
    if (!item) return; setBusy(true); setError(null); setGrade(null); setAnswer("");
    try { const r = await fetch("/api/ai/item-variation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId: item.id, regenerate }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setVariation(d.variation); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const check = async () => {
    if (!item || !variation || !answer.trim()) return; setBusy(true);
    try { const r = await fetch("/api/ai/grade-item", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId: item.id, variationId: variation.id, attempt: answer }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setGrade(d); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const next = () => { setIndex((i) => items ? (i + 1) % items.length : i); setVariation(null); setGrade(null); setAnswer(""); };
  const rate = async (rating: Rating) => {
    if (!item || !variation || !grade) return; setBusy(true);
    try { const r = await fetch("/api/items/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId: item.id, rating, direction: "production", verdict: grade.verdict, errorType: grade.errorType, userAnswer: answer, correctedAnswer: grade.corrected, gradeReason: grade.reason, gradedBy: grade.gradedBy ?? undefined }) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error); next(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return <main className="container max-w-xl py-6">
    <Link href="/" className="mb-5 inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4"/>Home</Link>
    <h1 className="text-2xl font-semibold">Fresh contexts</h1><p className="mb-5 text-sm text-muted-foreground">New A2 situations for lesson French missed more than once.</p>
    {!items ? <div className="h-48 animate-pulse rounded-xl bg-muted"/> : items.length === 0 ? <Card><CardContent className="py-10 text-center"><Sparkles className="mx-auto mb-3 h-8 w-8"/><p className="font-medium">No repeatedly missed items yet</p><p className="mt-1 text-sm text-muted-foreground">This practice appears after an item has been missed twice.</p></CardContent></Card> : <Card><CardContent className="space-y-5 p-6">
      <div className="text-sm text-muted-foreground">Target skill <span className="font-medium text-foreground">{item?.french}</span></div>
      {!variation ? <Button className="w-full" size="lg" onClick={() => generate()} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Sparkles className="h-4 w-4"/>}Create a context</Button> : <>
        <p className="text-xl">{variation.promptEn}</p>
        {!grade ? <><Input value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => e.key === "Enter" && check()} placeholder="Say it in French"/><Button className="w-full" onClick={check} disabled={busy || !answer.trim()}>{busy && <Loader2 className="h-4 w-4 animate-spin"/>}Check</Button></> : <><div className="rounded-lg bg-muted p-4"><div className="flex items-start gap-2"><p className="flex-1 text-lg font-medium">{grade.corrected}</p><SpeakButton text={grade.corrected}/></div><p className="mt-2 text-sm">{grade.verdict.replace("_", " ")}{grade.reason ? ` · ${grade.reason}` : ""}</p></div><RateButtons onRate={rate} disabled={busy}/></>}
        {!grade && <div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => generate(true)} disabled={busy}><RefreshCw className="h-4 w-4"/>Different context</Button><Button onClick={next}>Next item</Button></div>}
      </>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </CardContent></Card>}
  </main>;
}
