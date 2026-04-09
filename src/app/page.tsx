"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BookOpen,
  MessageSquare,
  ListChecks,
  Sparkles,
  AlertCircle,
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
import { guessTimezone } from "@/lib/utils";

interface Stats {
  dueNow: number;
  dueTodayTotal: number;
  totalActive: number;
  dailyTarget: number;
  retention: number;
  correctTotal: number;
  wrongTotal: number;
  weakest: Array<{ verbId: number; infinitive: string; english: string; wrong: number; correct: number }>;
  activeTenses: string[];
  activeLevels: string[];
  timezone: string;
}

const MODES = [
  {
    href: "/practice/drill",
    title: "Fill-in-the-blank",
    description: "Type the correct conjugation.",
    icon: BookOpen,
  },
  {
    href: "/practice/flashcards",
    title: "Flashcards",
    description: "Reveal and rate how well you knew it.",
    icon: Sparkles,
  },
  {
    href: "/practice/multiple-choice",
    title: "Multiple choice",
    description: "Pick the right form from four options.",
    icon: ListChecks,
  },
  {
    href: "/practice/sentence",
    title: "AI sentence builder",
    description: "Translate with formal / neutral / informal variants.",
    icon: MessageSquare,
  },
];

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Set timezone to the browser's on first load if still UTC.
  useEffect(() => {
    (async () => {
      try {
        const statsRes = await fetch("/api/stats", { cache: "no-store" });
        if (!statsRes.ok) {
          setError(`Stats: ${statsRes.status}`);
          return;
        }
        const data: Stats = await statsRes.json();
        // If timezone is UTC (default), set it to the browser's timezone.
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
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  const dailyDone = Math.min(stats.dailyTarget, stats.correctTotal);
  const dailyPct =
    stats.dailyTarget > 0
      ? Math.min(100, Math.round((dailyDone / stats.dailyTarget) * 100))
      : 0;

  const isEmpty = stats.totalActive === 0;

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Bonjour 👋</h1>
        <p className="mt-1 text-muted-foreground">
          Let&apos;s keep your French muscles warm.
        </p>
      </div>

      {isEmpty && (
        <Card className="mb-6 border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle>Welcome! No cards yet.</CardTitle>
            <CardDescription>
              Your database is connected but empty. Run <code>npm run seed</code>{" "}
              to populate it, or head to{" "}
              <Link href="/settings" className="underline">
                Settings
              </Link>{" "}
              to enable more tenses and levels.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Due now</CardDescription>
            <CardTitle className="text-3xl">{stats.dueNow}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              of {stats.totalActive} active cards
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Retention</CardDescription>
            <CardTitle className="text-3xl">{stats.retention}%</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              {stats.correctTotal} correct · {stats.wrongTotal} wrong
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>
              Daily target ({stats.dailyTarget})
            </CardDescription>
            <CardTitle className="text-3xl">
              {dailyDone}
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                / {stats.dailyTarget}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Progress value={dailyPct} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <div className="text-sm text-muted-foreground">Active:</div>
        {stats.activeTenses.map((t) => (
          <Badge key={t} variant="secondary">
            {t}
          </Badge>
        ))}
        {stats.activeLevels.map((l) => (
          <Badge key={l} variant="outline">
            {l}
          </Badge>
        ))}
        <Button variant="link" size="sm" asChild className="h-6 px-2">
          <Link href="/settings">Edit</Link>
        </Button>
      </div>

      <h2 className="mt-10 text-lg font-semibold tracking-tight">
        Practice modes
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {MODES.map((m) => {
          const Icon = m.icon;
          return (
            <Link key={m.href} href={m.href} className="group">
              <Card className="h-full transition-all group-hover:border-primary/50 group-hover:shadow-md">
                <CardHeader>
                  <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle>{m.title}</CardTitle>
                  <CardDescription>{m.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>

      {stats.weakest.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">
            Weakest verbs
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You&apos;ve struggled with these the most. They&apos;ll surface more
            often.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {stats.weakest.map((w) => {
              const total = w.wrong + w.correct;
              const pctWrong =
                total > 0 ? Math.round((w.wrong / total) * 100) : 0;
              return (
                <Card key={w.verbId}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <div className="font-serif text-lg">{w.infinitive}</div>
                      <div className="text-xs text-muted-foreground">
                        {w.english}
                      </div>
                    </div>
                    <Badge variant="destructive">{pctWrong}% wrong</Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
