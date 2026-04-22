"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BookOpen,
  MessageSquare,
  ListChecks,
  Sparkles,
  AlertCircle,
  Hash,
  ArrowRight,
  Settings,
  Target,
  TrendingUp,
  Clock,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TranslateBox } from "@/components/translate-box";
import { guessTimezone, cn } from "@/lib/utils";

interface Stats {
  dueNow: number;
  dueTodayTotal: number;
  totalActive: number;
  dueNowVerb: number;
  dueTodayVerb: number;
  totalActiveVerb: number;
  dueNowPhrase: number;
  dueTodayPhrase: number;
  totalActivePhrase: number;
  dailyTarget: number;
  reviewedToday: number;
  retention: number;
  correctTotal: number;
  wrongTotal: number;
  weakest: Array<{
    verbId: number;
    infinitive: string;
    english: string;
    wrong: number;
    correct: number;
  }>;
  weakestPhrases: Array<{
    phraseId: number;
    french: string;
    english: string;
    category: string;
    wrong: number;
    correct: number;
  }>;
  activeTenses: string[];
  activeLevels: string[];
  activePhraseCategories: string[];
  learningStage: string;
  timezone: string;
}

type Mode = {
  href: string;
  title: string;
  description: string;
  icon: typeof BookOpen;
  accent: string;
};

const VERB_MODES: Mode[] = [
  {
    href: "/practice/drill",
    title: "Fill-in-the-blank",
    description: "Type the correct conjugation.",
    icon: BookOpen,
    accent: "border-l-blue-500",
  },
  {
    href: "/practice/flashcards",
    title: "Flashcards",
    description: "Reveal and rate yourself.",
    icon: Sparkles,
    accent: "border-l-purple-500",
  },
  {
    href: "/practice/multiple-choice",
    title: "Multiple choice",
    description: "Pick the right form.",
    icon: ListChecks,
    accent: "border-l-teal-500",
  },
  {
    href: "/practice/sentence",
    title: "AI sentence builder",
    description: "Formal · neutral · informal.",
    icon: MessageSquare,
    accent: "border-l-amber-500",
  },
];

function getGreeting(): { greeting: string; emoji: string; timeOfDay: string } {
  const h = new Date().getHours();
  if (h < 12) return { greeting: "Bonjour", emoji: "☀️", timeOfDay: "morning" };
  if (h < 17)
    return { greeting: "Bon après-midi", emoji: "🌤️", timeOfDay: "afternoon" };
  if (h < 21) return { greeting: "Bonsoir", emoji: "🌅", timeOfDay: "evening" };
  return { greeting: "Bonsoir", emoji: "🌙", timeOfDay: "night" };
}

function getMotivation(stats: Stats): string {
  const reviewed = stats.correctTotal + stats.wrongTotal;
  if (reviewed === 0) return "Ready to start your first session?";
  if (stats.dueNow === 0) return "All caught up — nice work! Come back later.";
  if (stats.reviewedToday >= stats.dailyTarget)
    return `Daily target hit! ${stats.dueNow} more if you're feeling ambitious.`;
  if (stats.retention >= 90) return `${stats.retention}% retention — you're crushing it.`;
  if (stats.retention >= 70)
    return `${stats.dueNow} cards waiting. Let's keep that streak going.`;
  return `${stats.dueNow} cards to review. A little practice goes a long way.`;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const statsRes = await fetch("/api/stats", { cache: "no-store" });
        if (!statsRes.ok) {
          setError(`Stats: ${statsRes.status}`);
          return;
        }
        const data: Stats = await statsRes.json();
        if (data.timezone === "UTC") {
          const tz = guessTimezone();
          if (tz && tz !== "UTC") {
            await fetch("/api/settings", {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ timezone: tz }),
            });
            data.timezone = tz;
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
      <div className="container max-w-2xl py-12">
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Couldn&apos;t load dashboard
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              If this is your first run: create <code>.env.local</code>, run{" "}
              <code>npm run db:push</code>, then <code>npm run seed</code>.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="container max-w-4xl py-12">
        <div className="space-y-4">
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  const dailyDone = Math.min(stats.dailyTarget, stats.reviewedToday);
  const dailyPct =
    stats.dailyTarget > 0
      ? Math.min(100, Math.round((dailyDone / stats.dailyTarget) * 100))
      : 0;
  const isEmpty = stats.totalActive === 0;
  const { greeting, emoji } = getGreeting();
  const motivation = getMotivation(stats);

  return (
    <div className="container max-w-5xl py-8">
      {/* ── Two-column grid: main content + stats sidebar ── */}
      <div className="grid gap-8 md:grid-cols-[1fr_220px]">
        {/* ════ LEFT COLUMN: main content ════ */}
        <div className="min-w-0">
          {/* Greeting */}
          <div className="mb-6">
            <h1 className="text-3xl font-semibold tracking-tight">
              {greeting} {emoji}
            </h1>
            <p className="mt-1.5 text-muted-foreground">{motivation}</p>
          </div>

          {/* Mobile-only: compact stats row */}
          <div className="mb-6 flex gap-3 md:hidden">
            <div className="flex-1 rounded-lg border bg-card p-3 text-center">
              <div className="text-2xl font-semibold">{stats.dueNow}</div>
              <div className="text-[11px] text-muted-foreground">due</div>
            </div>
            <div className="flex-1 rounded-lg border bg-card p-3 text-center">
              <div className="text-2xl font-semibold">{stats.retention}%</div>
              <div className="text-[11px] text-muted-foreground">retention</div>
            </div>
            <div className="flex-1 rounded-lg border bg-card p-3 text-center">
              <div className="text-2xl font-semibold">
                {dailyDone}
                <span className="text-sm font-normal text-muted-foreground">
                  /{stats.dailyTarget}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground">today</div>
            </div>
          </div>

          {/* Translate box */}
          <div className="mb-8">
            <TranslateBox />
          </div>

          {isEmpty && (
            <Card className="mb-8 border-primary/30 bg-primary/5">
              <CardHeader>
                <CardTitle>Welcome! No cards yet.</CardTitle>
                <CardDescription>
                  Run <code>npm run seed</code> to populate your database, or
                  head to{" "}
                  <Link href="/settings" className="underline">
                    Settings
                  </Link>{" "}
                  to choose a Learning Stage.
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          {/* ── Foundations ── */}
          {stats.totalActivePhrase > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold tracking-tight">
                Foundations
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Articles, numbers, questions, greetings, phrases, countries,
                cities, time.
              </p>
              <div className="mt-3">
                <Link href="/practice/phrases" className="group">
                  <Card className="border-l-4 border-l-emerald-500 transition-all group-hover:border-l-emerald-400 group-hover:shadow-md">
                    <CardHeader className="flex flex-row items-center gap-4 py-4">
                      <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                        <Hash className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base">Foundations</CardTitle>
                        <CardDescription className="text-xs">
                          Flashcard-style — English to French
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        {stats.dueNowPhrase > 0 && (
                          <Badge variant="default">
                            {stats.dueNowPhrase} due
                          </Badge>
                        )}
                        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              </div>
            </div>
          )}

          {/* ── Verb practice ── */}
          {stats.totalActiveVerb > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold tracking-tight">
                Verb practice
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Conjugation drills.
                {stats.dueNowVerb > 0 && (
                  <>
                    {" "}
                    <span className="text-foreground font-medium">
                      {stats.dueNowVerb}
                    </span>{" "}
                    due now.
                  </>
                )}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {VERB_MODES.map((m) => {
                  const Icon = m.icon;
                  return (
                    <Link key={m.href} href={m.href} className="group">
                      <Card
                        className={cn(
                          "h-full border-l-4 transition-all group-hover:shadow-md",
                          m.accent
                        )}
                      >
                        <CardHeader className="py-4">
                          <div className="flex items-center gap-3">
                            <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                              <Icon className="h-5 w-5" />
                            </div>
                            <div>
                              <CardTitle className="text-sm">
                                {m.title}
                              </CardTitle>
                              <CardDescription className="text-xs">
                                {m.description}
                              </CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {stats.totalActiveVerb === 0 && stats.totalActivePhrase === 0 && (
            <Card className="mb-8 border-primary/30 bg-primary/5">
              <CardHeader>
                <CardTitle>Nothing active yet</CardTitle>
                <CardDescription>
                  Head to{" "}
                  <Link href="/settings" className="underline">
                    Settings
                  </Link>{" "}
                  and pick a Learning Stage to get started.
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          {/* ── Needs attention ── */}
          {(stats.weakest.length > 0 || stats.weakestPhrases.length > 0) && (
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Needs attention
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your trickiest items — they&apos;ll surface more often.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {stats.weakest.map((w) => {
                  const total = w.wrong + w.correct;
                  const pctWrong =
                    total > 0 ? Math.round((w.wrong / total) * 100) : 0;
                  return (
                    <div
                      key={`verb-${w.verbId}`}
                      className="flex items-center justify-between rounded-lg border px-4 py-2.5"
                    >
                      <div>
                        <span className="font-serif text-base">
                          {w.infinitive}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {w.english}
                        </span>
                      </div>
                      <Badge variant="destructive" className="text-[10px]">
                        {pctWrong}%
                      </Badge>
                    </div>
                  );
                })}
                {stats.weakestPhrases.map((p) => {
                  const total = p.wrong + p.correct;
                  const pctWrong =
                    total > 0 ? Math.round((p.wrong / total) * 100) : 0;
                  return (
                    <div
                      key={`phrase-${p.phraseId}`}
                      className="flex items-center justify-between rounded-lg border px-4 py-2.5"
                    >
                      <div>
                        <span className="font-serif text-base">
                          {p.french}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {p.english}
                        </span>
                      </div>
                      <Badge variant="destructive" className="text-[10px]">
                        {pctWrong}%
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ════ RIGHT COLUMN: stats sidebar (desktop only) ════ */}
        <aside className="hidden md:block">
          <div className="sticky top-20 space-y-3">
            {/* Due now */}
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Due now
              </div>
              <div className="mt-1 text-3xl font-semibold tracking-tight">
                {stats.dueNow}
              </div>
              <div className="text-[11px] text-muted-foreground">
                of {stats.totalActive} active
              </div>
            </div>

            {/* Retention */}
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" />
                Retention
              </div>
              <div className="mt-1 text-3xl font-semibold tracking-tight">
                {stats.retention}
                <span className="text-lg">%</span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {stats.correctTotal} correct · {stats.wrongTotal} wrong
              </div>
            </div>

            {/* Daily target */}
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Target className="h-3.5 w-3.5" />
                Daily target
              </div>
              <div className="mt-1 text-2xl font-semibold tracking-tight">
                {dailyDone}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / {stats.dailyTarget}
                </span>
              </div>
              <Progress value={dailyPct} className="mt-2 h-1.5" />
            </div>

            {/* Stage + settings link */}
            <div className="rounded-xl border bg-card p-4">
              <div className="text-xs font-medium text-muted-foreground">
                Stage
              </div>
              <div className="mt-1">
                <Badge variant="secondary" className="capitalize">
                  {stats.learningStage.replace(/_/g, " ")}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="mt-2 -ml-2 h-7 text-xs text-muted-foreground"
              >
                <Link href="/settings">
                  <Settings className="mr-1 h-3 w-3" />
                  Settings
                </Link>
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
