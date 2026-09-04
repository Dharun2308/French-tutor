"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Camera,
  CalendarDays,
  Clock3,
  Ear,
  Hash,
  ListChecks,
  MessageSquare,
  BarChart3,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TranslateBox } from "@/components/translate-box";
import { guessTimezone } from "@/lib/utils";

interface Stats {
  timezone: string;
  learningItemsTotal: number;
}

const PRACTICE_LINKS = [
  { href: "/practice/smart", title: "Smart session", detail: "Mixed review", icon: Zap },
  { href: "/practice/sentence", title: "Sentence builder", detail: "Produce full French", icon: MessageSquare },
  { href: "/practice/phrases", title: "Foundations", detail: "Everyday phrases", icon: Hash },
  { href: "/practice/drill", title: "Verb drill", detail: "Type conjugations", icon: BookOpen },
  { href: "/practice/flashcards", title: "Verb cards", detail: "Reveal and rate", icon: Sparkles },
  { href: "/practice/multiple-choice", title: "Quick choice", detail: "Recognise forms", icon: ListChecks },
] as const;

const PERSONAL_LINKS = [
  { href: "/practice/focus", title: "10-minute focus", detail: "Due, weak, listening, corrections", icon: Clock3 },
  { href: "/practice/listening", title: "Listening", detail: "Hear it, then type it", icon: Ear },
  { href: "/conversation", title: "AI conversation", detail: "Quietly targets weak French", icon: MessageSquare },
  { href: "/practice/variations", title: "Fresh contexts", detail: "For repeatedly missed items", icon: Sparkles },
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

  const hasLessonItems = stats.learningItemsTotal > 0;

  return (
    <main className="container max-w-4xl py-7 sm:py-9">
      <header className="mb-5">
        <h1 className="text-3xl font-semibold tracking-tight">{greeting()}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Practice the French you want to use in conversation.</p>
      </header>

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

      {hasLessonItems && <section className="mb-7">
        <h2 className="mb-3 text-lg font-semibold">Practice now</h2>
        <div className="grid grid-cols-2 gap-2">
          {PERSONAL_LINKS.map(({ href, title, detail, icon: Icon }) => <Link key={href} href={href} className="group rounded-lg border bg-card p-3 transition-colors hover:border-primary/50"><Icon className="mb-2 h-5 w-5 text-rose-600"/><div className="text-sm font-medium">{title}</div><div className="text-[11px] text-muted-foreground">{detail}</div></Link>)}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button asChild variant="outline"><Link href="/progress"><BarChart3 className="h-4 w-4"/>Learning picture</Link></Button>
          <Button asChild variant="outline"><Link href="/weekly"><CalendarDays className="h-4 w-4"/>Weekly review</Link></Button>
        </div>
      </section>}

      <section className="mb-7">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold">More practice</h2>
            <p className="text-xs text-muted-foreground">Short drills when you want them.</p>
          </div>
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
