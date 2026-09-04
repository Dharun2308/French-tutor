"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Check, ChevronDown, Library, Loader2, Moon, Sun, Volume2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTts } from "@/components/tts-provider";
import { speak } from "@/lib/client-tts";
import { ProviderSettings } from "@/components/provider-status";
import {
  TENSES,
  TENSE_LABELS,
  LEVELS,
  LEARNING_STAGES,
  STAGE_PRESETS,
  PHRASE_CATEGORIES,
  PHRASE_CATEGORY_LABELS,
  type Tense,
  type Level,
  type LearningStage,
  type PhraseCategory,
} from "@/types";

const VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "sage",
  "shimmer",
] as const;

type TtsMode = "browser" | "openai";

interface Settings {
  dailyTarget: number;
  activeTenses: Tense[];
  activeLevels: Level[];
  preferredRegister: "formal" | "neutral" | "informal" | "all";
  ttsMode: TtsMode;
  ttsVoice: string;
  learningStage: LearningStage;
  activePhraseCategories: PhraseCategory[];
  timezone: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setMode: setTtsModeCtx, setVoice: setTtsVoiceCtx } = useTts();
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) {
        setError(`Settings: HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      setSettings({
        dailyTarget: data.dailyTarget,
        activeTenses: data.activeTenses ?? [],
        activeLevels: data.activeLevels,
        preferredRegister: data.preferredRegister,
        ttsMode: data.ttsMode ?? "browser",
        ttsVoice: data.ttsVoice ?? "alloy",
        learningStage: data.learningStage ?? "present",
        activePhraseCategories:
          data.activePhraseCategories ?? [
            "article",
            "number",
            "question",
            "greeting",
            "phrase",
          ],
        timezone: data.timezone,
      });
    })();
  }, []);

  // Apply a preset from the Learning Stage selector. Overwrites tenses,
  // levels, and phrase categories in one go.
  const applyStage = (stage: LearningStage) => {
    const preset = STAGE_PRESETS[stage];
    setSettings((s) =>
      s
        ? {
            ...s,
            learningStage: stage,
            activeTenses: preset.activeTenses,
            activeLevels: preset.activeLevels,
            activePhraseCategories: preset.activePhraseCategories,
          }
        : s
    );
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      // Also update the in-memory TTS context so other pages don't need
      // a hard refresh.
      setTtsModeCtx(settings.ttsMode);
      setTtsVoiceCtx(settings.ttsVoice);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (error && !settings) {
    return (
      <div className="container max-w-2xl py-10">
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle>Couldn&apos;t load settings</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="container max-w-2xl py-10">
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  const toggleTense = (t: Tense) => {
    setSettings((s) => {
      if (!s) return s;
      const active = s.activeTenses.includes(t)
        ? s.activeTenses.filter((x) => x !== t)
        : [...s.activeTenses, t];
      return { ...s, activeTenses: active.length ? active : [t] };
    });
  };

  const toggleLevel = (l: Level) => {
    setSettings((s) => {
      if (!s) return s;
      const active = s.activeLevels.includes(l)
        ? s.activeLevels.filter((x) => x !== l)
        : [...s.activeLevels, l];
      return { ...s, activeLevels: active.length ? active : [l] };
    });
  };

  const togglePhraseCategory = (cat: PhraseCategory) => {
    setSettings((s) => {
      if (!s) return s;
      const active = s.activePhraseCategories.includes(cat)
        ? s.activePhraseCategories.filter((x) => x !== cat)
        : [...s.activePhraseCategories, cat];
      return { ...s, activePhraseCategories: active };
    });
  };

  return (
    <div className="container max-w-2xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Keep the app comfortable. Your lesson notes and review history handle
          most learning choices automatically.
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardContent className="divide-y p-5">
            <div className="flex items-center justify-between gap-4 pb-4">
              <div>
                <p className="font-medium">Reference library</p>
                <p className="text-sm text-muted-foreground">Browse verbs and conjugations.</p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/library">
                  <Library className="h-4 w-4" />
                  Library
                </Link>
              </Button>
            </div>
            <div className="flex items-center justify-between gap-4 pt-4">
              <div>
                <p className="font-medium">Appearance</p>
                <p className="text-sm text-muted-foreground">Choose light or dark.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={resolvedTheme === "light" ? "default" : "outline"}
                  onClick={() => setTheme("light")}
                  aria-label="Use light appearance"
                >
                  <Sun className="h-4 w-4" />
                  <span className="hidden sm:inline">Light</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={resolvedTheme === "dark" ? "default" : "outline"}
                  onClick={() => setTheme("dark")}
                  aria-label="Use dark appearance"
                >
                  <Moon className="h-4 w-4" />
                  <span className="hidden sm:inline">Dark</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Learning</CardTitle>
            <CardDescription>
              Imported lesson items, Listening, Weak French, and Focus adapt
              from your actual practice automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="learning-stage">Foundation practice stage</Label>
              <select
                id="learning-stage"
                value={settings.learningStage}
                onChange={(e) => applyStage(e.target.value as LearningStage)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {LEARNING_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {STAGE_PRESETS[stage].label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {STAGE_PRESETS[settings.learningStage].description}
              </p>
            </div>
            <div className="flex items-center justify-between gap-4 border-t pt-4">
              <div>
                <Label htmlFor="daily-target">Daily review target</Label>
                <p className="text-xs text-muted-foreground">Used by dashboard progress.</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  id="daily-target"
                  type="number"
                  min={1}
                  max={500}
                  value={settings.dailyTarget}
                  onChange={(e) =>
                    setSettings((s) =>
                      s ? { ...s, dailyTarget: parseInt(e.target.value) || 20 } : s
                    )
                  }
                  className="w-20"
                />
                <span className="text-xs text-muted-foreground">/ day</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <details className="group rounded-xl border bg-card text-card-foreground shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 [&::-webkit-details-marker]:hidden">
            <div>
              <p className="font-semibold">Extra practice controls</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Fine-tune the older verb, phrase, and sentence modes.
              </p>
            </div>
            <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-6 border-t p-5">
            <div className="space-y-2">
              <Label>Active tenses</Label>
              <p className="text-xs text-muted-foreground">Only affects verb practice.</p>
            <div className="flex flex-wrap gap-2">
              {TENSES.map((t) => {
                const active = settings.activeTenses.includes(t);
                return (
                  <Button
                    key={t}
                    variant={active ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleTense(t)}
                  >
                    {TENSE_LABELS[t]}
                  </Button>
                );
              })}
            </div>
            </div>

            <div className="space-y-2">
              <Label>Foundation categories</Label>
              <p className="text-xs text-muted-foreground">Only affects foundation flashcards and drills.</p>
            <div className="flex flex-wrap gap-2">
              {PHRASE_CATEGORIES.map((c) => {
                const active = settings.activePhraseCategories.includes(c);
                return (
                  <Button
                    key={c}
                    variant={active ? "default" : "outline"}
                    size="sm"
                    onClick={() => togglePhraseCategory(c)}
                  >
                    {PHRASE_CATEGORY_LABELS[c]}
                  </Button>
                );
              })}
            </div>
            </div>

            <div className="space-y-2">
              <Label>Verb levels</Label>
            <div className="flex flex-wrap gap-2">
              {LEVELS.map((l) => {
                const active = settings.activeLevels.includes(l);
                return (
                  <Button
                    key={l}
                    variant={active ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleLevel(l)}
                  >
                    {l}
                  </Button>
                );
              })}
            </div>
            </div>

            <div className="space-y-2">
              <Label>Sentence-builder register</Label>
            <div className="flex flex-wrap gap-2">
              {(["formal", "neutral", "informal", "all"] as const).map((r) => (
                <Button
                  key={r}
                  variant={
                    settings.preferredRegister === r ? "default" : "outline"
                  }
                  size="sm"
                  className="capitalize"
                  onClick={() =>
                    setSettings((s) =>
                      s ? { ...s, preferredRegister: r } : s
                    )
                  }
                >
                  {r}
                </Button>
              ))}
            </div>
            </div>
          </div>
        </details>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="h-5 w-5" />
              Pronunciation
            </CardTitle>
            <CardDescription>
              Choose which voice engine powers the speaker buttons across the
              app.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  {
                    value: "browser",
                    label: "Browser (free)",
                    note: "Instant · depends on your OS voices",
                  },
                  {
                    value: "openai",
                    label: "OpenAI (premium)",
                    note: "~$0.015/1k chars · cached",
                  },
                ] as const
              ).map((opt) => (
                <Button
                  key={opt.value}
                  variant={settings.ttsMode === opt.value ? "default" : "outline"}
                  onClick={() =>
                    setSettings((s) =>
                      s ? { ...s, ttsMode: opt.value } : s
                    )
                  }
                  className="h-auto flex-col items-start py-2 text-left"
                >
                  <span className="font-semibold">{opt.label}</span>
                  <span className="text-[10px] opacity-70">{opt.note}</span>
                </Button>
              ))}
            </div>
            {settings.ttsMode === "openai" && (
              <div className="space-y-2">
                <Label>Voice</Label>
                <div className="flex flex-wrap gap-2">
                  {VOICES.map((v) => (
                    <Button
                      key={v}
                      size="sm"
                      variant={
                        settings.ttsVoice === v ? "default" : "outline"
                      }
                      onClick={() =>
                        setSettings((s) => (s ? { ...s, ttsVoice: v } : s))
                      }
                      className="capitalize"
                    >
                      {v}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  speak(
                    settings.ttsMode,
                    "Bonjour. Je parle français. Je voudrais un café, s'il vous plaît.",
                    settings.ttsVoice
                  )
                }
              >
                <Volume2 className="h-4 w-4" />
                Test voice
              </Button>
              <span className="text-xs text-muted-foreground">
                Click to hear a sample sentence.
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          {error && <Badge variant="destructive">{error}</Badge>}
          <div className="ml-auto flex items-center gap-3">
            {saved && (
              <span className={cn("flex items-center gap-1 text-sm text-green-600")}>
                <Check className="h-4 w-4" /> Saved
              </span>
            )}
            <Button onClick={save} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </div>
        </div>

        <ProviderSettings />

        <details className="group rounded-xl border bg-card text-card-foreground shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 [&::-webkit-details-marker]:hidden">
            <div>
              <p className="font-semibold">Technical</p>
              <p className="mt-1 text-sm text-muted-foreground">Timezone used for daily and weekly boundaries.</p>
            </div>
            <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t p-5">
            <div className="space-y-2">
              <Label htmlFor="tz">Timezone</Label>
              <Input
                id="tz"
                value={settings.timezone}
                onChange={(e) =>
                  setSettings((s) => (s ? { ...s, timezone: e.target.value } : s))
                }
              />
              <p className="text-xs text-muted-foreground">
                IANA timezone, e.g. <code>America/Los_Angeles</code>. Used to
                anchor &ldquo;due today&rdquo;.
              </p>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
