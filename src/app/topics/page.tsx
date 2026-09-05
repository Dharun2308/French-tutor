"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, Headphones, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STATE_LABELS, type Topic, type TopicState } from "@/lib/curriculum/types";

interface Metric { total: number; correct: number; percent: number | null }
interface TopicView extends Topic {
  state: TopicState; theoryUnderstood: boolean; production: Metric; controlled: Metric; mixed: Metric;
  oral: number; due: boolean; ready: boolean; sessionId: string | null;
  errors: { tag: string; misses: number; weight: number }[];
}
interface Overview { topics: TopicView[]; recommendedNew: string | null; recommendedReview: string; mixedSessionId: string | null }

function topicColour(topic: TopicView) {
  if (topic.coverage === "practiced" || topic.production.total > 0 || topic.mixed.total > 0 || ["85_PERCENT_REACHED", "MAINTENANCE", "AUTOMATIC"].includes(topic.state)) {
    return { surface: "border-l-emerald-500 bg-emerald-50/80 hover:bg-emerald-100/80 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50", text: "text-emerald-900 dark:text-emerald-200" };
  }
  if (topic.state === "NOT_STARTED") {
    return { surface: "border-l-rose-500 bg-rose-50/80 hover:bg-rose-100/80 dark:bg-rose-950/30 dark:hover:bg-rose-950/50", text: "text-rose-900 dark:text-rose-200" };
  }
  return { surface: "border-l-amber-500 bg-amber-50/80 hover:bg-amber-100/80 dark:bg-amber-950/30 dark:hover:bg-amber-950/50", text: "text-amber-900 dark:text-amber-200" };
}

export default function TopicsPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("Grammar");
  const load = () => { setError(null); fetch("/api/topics", { cache: "no-store" }).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setData(d); }).catch((e) => setError(e.message)); };
  useEffect(load, []);
  if (!data) return <main className="container max-w-3xl py-8">{error ? <><p>{error}</p><Button className="mt-3" onClick={load}>Retry</Button></> : <div className="h-60 animate-pulse rounded-xl bg-muted" />}</main>;
  const next = data.topics.find((t) => t.id === data.recommendedNew);
  const revisit = data.topics.find((t) => t.id === data.recommendedReview);
  const groups = ["Grammar", "Needs review", "Pronunciation & listening", "Communication", ...new Set(data.topics.filter((t) => t.kind === "grammar").map((t) => t.group))];
  const filtered = data.topics.filter((t) => {
    const matches = group === "Grammar" ? t.kind === "grammar" : group === "Needs review" ? t.due || t.state === "REVISIT_REQUIRED" : t.group === group;
    return matches && `${t.title} ${t.notes} ${t.group}`.toLowerCase().includes(query.toLowerCase());
  });
  const grouped = [...new Set(filtered.map((t) => t.group))];
  return <main className="container max-w-3xl py-7">
    <Link href="/" className="mb-5 inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Dashboard</Link>
    <h1 className="text-3xl font-semibold">Topics</h1>
    <p className="mt-2 text-sm text-muted-foreground">Learn something new, or strengthen a rule you’re unsure about.</p>
    <Link href="/topics/language-transfer" className="mt-5 flex items-center gap-3 rounded-xl border border-blue-500/30 bg-blue-500/5 p-4"><Headphones className="h-6 w-6 shrink-0 text-blue-600 dark:text-blue-400" /><div className="flex-1"><p className="font-medium">Language Transfer</p><p className="mt-1 text-xs text-muted-foreground">Introduction to French · all 40 audio lessons</p></div><ArrowRight className="h-4 w-4" /></Link>
    <div className="my-5 grid gap-2 sm:grid-cols-2">
      {next && <Link href={`/topics/${next.id}`} className={`rounded-xl border border-l-4 p-4 transition-colors ${topicColour(next).surface}`}><p className="text-xs text-muted-foreground">Next new topic</p><p className={`mt-1 font-medium ${topicColour(next).text}`}>{next.title} <ArrowRight className="inline h-4 w-4" /></p></Link>}
      {revisit && <Link href={`/topics/${revisit.id}`} className={`rounded-xl border border-l-4 p-4 transition-colors ${topicColour(revisit).surface}`}><p className="text-xs text-muted-foreground">Worth revisiting</p><p className={`mt-1 font-medium ${topicColour(revisit).text}`}>{revisit.title} <ArrowRight className="inline h-4 w-4" /></p></Link>}
    </div>
    <Button asChild variant="outline" className="mb-6 w-full"><Link href="/topics/mixed"><BookOpen className="h-4 w-4" />{data.mixedSessionId ? "Resume daily mix" : "Daily mix · 10 questions"}</Link></Button>
    <div className="mb-5 flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Search topics" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Articles, pronouns, past tense…" /></div>
      <select aria-label="Topic family" className="h-10 rounded-md border bg-background px-3 text-sm" value={group} onChange={(e) => setGroup(e.target.value)}>{groups.map((g) => <option key={g}>{g}</option>)}</select>
    </div>
    <div aria-label="Topic colour key" className="mb-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Practiced</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />Partly covered / in progress</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" />Not started</span>
    </div>
    {grouped.map((g) => <section key={g} className="mb-6"><h2 className="mb-2 text-sm font-semibold">{g}</h2><div className="divide-y overflow-hidden rounded-xl border">
      {filtered.filter((t) => t.group === g).map((t) => <Link key={t.id} href={`/topics/${t.id}`} className={`flex items-center justify-between gap-3 border-l-4 p-3 transition-colors ${topicColour(t).surface}`}>
        <div className="min-w-0"><p className={`text-sm font-medium ${topicColour(t).text}`}>{t.title}</p><p className="mt-1 text-xs text-muted-foreground">{t.sessionId ? "In progress" : t.due ? "Review due" : STATE_LABELS[t.state]}{t.coverage === "practiced" && !t.production.total ? " · previously practiced" : ""}{t.coverage === "partial" && !t.controlled.total ? " · partly covered" : ""}{!t.ready ? " · prerequisites first" : ""}</p></div>
        <span className="shrink-0 text-xs text-muted-foreground">{t.production.total ? `${t.production.percent}% · ${t.production.total} attempts` : <ArrowRight className="h-4 w-4" />}</span>
      </Link>)}
    </div></section>)}
    {!filtered.length && <p className="py-6 text-sm text-muted-foreground">No topics match this search.</p>}
    <details className="rounded-xl border p-4 text-sm"><summary className="cursor-pointer font-medium">How progress works</summary><div className="mt-3 space-y-2 text-muted-foreground"><p>Your ChatGPT history records what you’ve covered, without inventing accuracy scores. Previously practiced topics skip the beginner explanation unless you request it.</p><p>New topics: short theory → guided questions → 20 independent sentences. At 85%, move into spaced review. At 70–84%, target weak subrules; below 70%, briefly refresh the concept.</p><p>Hints and reveal don’t count as independent successes. Minor writing slips are corrected separately from conceptual errors. Speaking aloud is self-reported practice, not a pronunciation assessment or proof of automatic conversation.</p></div></details>
  </main>;
}
