"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Camera,
  GraduationCap,
  Hash,
  ListChecks,
  MessageSquare,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TranslateBox } from "@/components/translate-box";
import { guessTimezone } from "@/lib/utils";

interface Stats {
  dueNow: number;
  dueNowVerb: number;
  dueNowPhrase: number;
  totalActiveVerb: number;
  totalActivePhrase: number;
  dailyTarget: number;
  reviewedToday: number;
  timezone: string;
  learningItemsTotal: number;
  learningItemsThisWeek: number;
  importsPending: number;
  importsFailed: number;
  learningItemsDue: number;
}

const PRACTICE_LINKS = [
  { href: "/practice/smart", title: "Smart session", detail: "Mixed review", icon: Zap },
  { href: "/practice/sentence", title: "Sentence builder", detail: "Produce full French", icon: MessageSquare },
  { href: "/practice/phrases", title: "Foundations", detail: "Everyday phrases", icon: Hash },
  { href: "/practice/drill", title: "Verb drill", detail: "Type conjugations", icon: BookOpen },
  { href: "/practice/flashcards", title: "Verb cards", detail: "Reveal and rate", icon: Sparkles },
  { href: "/practice/multiple-choice", title: "Quick choice", detail: "Recognise forms", icon: ListChecks },
] as const;

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bonjour";
  if (hour < 18) return "Bon après-midi";
  return "Bonsoir";
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/stats", { cache: "no-store" });
        if (!response.ok) throw new Error(`Stats: HTTP ${response.status}`);
        const data = (await response.json()) as Stats;
        if (data.timezone === "UTC") {
          const timezone = guessTimezone();
          if (timezone && timezone !== "UTC") {
            await fetch("/api/settings", {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ timezone }),
            });
            data.timezone = timezone;
          }
        }
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  if (error) {
    return (
      <div className="container max-w-2xl py-10">
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-6 text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" /> Couldn&apos;t load the dashboard: {error}
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!stats) {
    return <div className="container max-w-4xl py-8"><div className="h-52 animate-pulse rounded-xl bg-muted" /></div>;
  }

  const reviewDue = stats.dueNow + stats.learningItemsDue;
  const pendingReview = Math.max(0, stats.importsPending - stats.importsFailed);
  const hasLessonItems = stats.learningItemsTotal > 0;

  return (
    <main className="container max-w-4xl py-7 sm:py-9">
      <header className="mb-5">
        <h1 className="text-3xl font-semibold tracking-tight">{greeting()}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Practice the French you want to use in conversation.</p>
      </header>

      <div className="mb-5 grid grid-cols-3 overflow-hidden rounded-xl border bg-card">
        <div className="px-3 py-3 text-center">
          <div className="text-xl font-semibold">{stats.learningItemsDue}</div>
          <div className="text-[11px] text-muted-foreground">lesson items due</div>
        </div>
        <div className="border-x px-3 py-3 text-center">
          <div className="text-xl font-semibold">{reviewDue}</div>
          <div className="text-[11px] text-muted-foreground">all review due</div>
        </div>
        <div className="px-3 py-3 text-center">
          <div className="text-xl font-semibold">{stats.reviewedToday}</div>
          <div className="text-[11px] text-muted-foreground">reviewed today</div>
        </div>
      </div>

      {hasLessonItems ? (
        <Card className="mb-4 border-rose-500/40 bg-gradient-to-br from-rose-500/10 via-background to-background">
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-500/15">
                <Target className="h-5 w-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-lg">This week&apos;s speaking focus</CardTitle>
                <CardDescription>Your Active 10 from real lessons—ready to use with your tutor.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 pt-0 sm:flex-row">
            <Button asChild className="sm:flex-1">
              <Link href="/tutor"><MessageSquare className="h-4 w-4" />Open Tutor Mode</Link>
            </Button>
            <Button asChild variant="outline" className="sm:flex-1">
              <Link href="/weak">View Active 10 <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-4 border-rose-500/40">
          <CardHeader>
            <CardTitle className="text-lg">Start with your lesson notes</CardTitle>
            <CardDescription>Photograph a page and approve the French worth remembering.</CardDescription>
          </CardHeader>
          <CardContent><Button asChild><Link href="/import"><Camera className="h-4 w-4" />Import notes</Link></Button></CardContent>
        </Card>
      )}

      <div className="mb-7 grid gap-3 sm:grid-cols-2">
        {hasLessonItems && (
          <Link href="/practice/items" className="group">
            <Card className="h-full transition-colors group-hover:border-indigo-500/60">
              <CardContent className="flex items-center gap-3 py-4">
                <GraduationCap className="h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">Review lesson French</div>
                  <div className="text-xs text-muted-foreground">English → French, typed</div>
                </div>
                {stats.learningItemsDue > 0 && <Badge>{stats.learningItemsDue} due</Badge>}
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        )}
        <Link href="/import" className="group">
          <Card className="h-full transition-colors group-hover:border-rose-500/60">
            <CardContent className="flex items-center gap-3 py-4">
              <Camera className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">Import lesson notes</div>
                <div className="text-xs text-muted-foreground">
                  {stats.learningItemsThisWeek} added this week
                </div>
              </div>
              {stats.importsFailed > 0 ? (
                <Badge variant="destructive">{stats.importsFailed} failed</Badge>
              ) : pendingReview > 0 ? (
                <Badge>{pendingReview} to review</Badge>
              ) : null}
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </div>

      <section className="mb-7">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold">More practice</h2>
            <p className="text-xs text-muted-foreground">Short drills when you want them.</p>
          </div>
          {stats.dueNow > 0 && <Badge variant="secondary">{stats.dueNow} due</Badge>}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PRACTICE_LINKS.map(({ href, title, detail, icon: Icon }) => (
            <Link key={href} href={href} className="group rounded-lg border bg-card p-3 transition-colors hover:border-primary/50 hover:bg-accent/30">
              <Icon className="mb-2 h-4 w-4 text-muted-foreground group-hover:text-foreground" />
              <div className="text-sm font-medium">{title}</div>
              <div className="text-[11px] text-muted-foreground">{detail}</div>
            </Link>
          ))}
        </div>
      </section>

      <details className="rounded-xl border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Quick translate</summary>
        <div className="border-t p-4"><TranslateBox /></div>
      </details>
    </main>
  );
}
