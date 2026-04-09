"use client";
import { useRef, useState } from "react";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SpeakButton } from "@/components/speak-button";
import { cn } from "@/lib/utils";

type Direction = "en2fr" | "fr2en";

export function TranslateBox() {
  const [text, setText] = useState("");
  const [direction, setDirection] = useState<Direction>("en2fr");
  const [result, setResult] = useState<{
    translation: string;
    notes: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const translate = async () => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ai/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: text.trim(), direction }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setResult({ translation: data.translation, notes: data.notes });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const swap = () => {
    setDirection((d) => (d === "en2fr" ? "fr2en" : "en2fr"));
    if (result) {
      setText(result.translation);
      setResult(null);
    }
  };

  const fromLabel = direction === "en2fr" ? "English" : "French";
  const toLabel = direction === "en2fr" ? "French" : "English";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {fromLabel}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={swap}
            title="Swap direction"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {toLabel}
          </span>
        </div>
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                translate();
              }
            }}
            placeholder={
              direction === "en2fr"
                ? "Type English…"
                : "Tapez en français…"
            }
            className="flex-1"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <Button onClick={translate} disabled={loading || !text.trim()} size="default">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Go"}
          </Button>
        </div>
        {result && (
          <div className="mt-3 animate-fade-in space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-lg font-serif text-primary">
                {result.translation}
              </p>
              <SpeakButton
                text={
                  direction === "en2fr"
                    ? result.translation
                    : text
                }
              />
            </div>
            {result.notes && (
              <p className="text-xs text-muted-foreground italic">
                {result.notes}
              </p>
            )}
          </div>
        )}
        {error && (
          <p className="mt-2 text-xs text-destructive">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
