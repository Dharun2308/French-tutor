"use client";
import { useEffect, useState } from "react";
import { Check, Loader2, Sparkles, Volume2 } from "lucide-react";
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
  modelOverride: string | null;
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
        modelOverride: data.modelOverride,
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
          Tune your pace and which forms you&apos;re practicing.
        </p>
      </div>

      <div className="space-y-6">
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Where are you in your French journey?
            </CardTitle>
            <CardDescription>
              Pick the stage that best matches what you&apos;ve learned so far.
              This configures tenses, levels, and foundation categories in one
              click. You can still fine-tune each below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              {LEARNING_STAGES.map((stage) => {
                const preset = STAGE_PRESETS[stage];
                const active = settings.learningStage === stage;
                return (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => applyStage(stage)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-all",
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-input bg-background hover:border-primary/50 hover:bg-accent"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{preset.label}</span>
                      {active && <Check className="h-4 w-4" />}
                    </div>
                    <p
                      className={cn(
                        "mt-1 text-xs leading-relaxed",
                        active ? "opacity-80" : "text-muted-foreground"
                      )}
                    >
                      {preset.description}
                    </p>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Tip: start one stage below where you feel — the SRS will quickly
              surface what you already know and let you move up.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daily target</CardTitle>
            <CardDescription>
              How many cards you want to review per day. Used for the progress
              bar on the dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={1}
                max={500}
                value={settings.dailyTarget}
                onChange={(e) =>
                  setSettings((s) =>
                    s ? { ...s, dailyTarget: parseInt(e.target.value) || 20 } : s
                  )
                }
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">cards/day</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active tenses</CardTitle>
            <CardDescription>
              Only verb forms in these tenses will appear in verb practice
              modes. Leave empty to skip verb practice entirely (Newcomer /
              Foundations stage).
            </CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Foundation categories</CardTitle>
            <CardDescription>
              Non-verb content for the Phrases practice mode: articles,
              numbers, question words, greetings, and common phrases.
            </CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active levels</CardTitle>
            <CardDescription>
              Verbs at these CEFR levels will be included. Start narrow, expand
              as you grow.
            </CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preferred register</CardTitle>
            <CardDescription>
              Default register for AI-generated exercises in the sentence
              builder. You can always override per exercise.
            </CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

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

        <Card>
          <CardHeader>
            <CardTitle>Advanced</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="model">OpenAI model override</Label>
              <Input
                id="model"
                placeholder="gpt-5-mini (default)"
                value={settings.modelOverride ?? ""}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          modelOverride: e.target.value || null,
                        }
                      : s
                  )
                }
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to use <code>gpt-5-mini</code>. Env var{" "}
                <code>OPENAI_MODEL</code> takes precedence on the server.
              </p>
            </div>
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
      </div>
    </div>
  );
}
