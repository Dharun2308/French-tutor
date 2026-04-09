"use client";
import { useState } from "react";
import { Volume2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTts } from "./tts-provider";
import { speak } from "@/lib/client-tts";

interface Props {
  text: string;
  /** Include the pronoun when speaking (useful for conjugations). */
  withPronoun?: string;
  size?: "icon-sm" | "icon" | "default";
  variant?: "ghost" | "outline";
  className?: string;
  /** Stop propagation on click (for speak buttons inside clickable cards). */
  stopPropagation?: boolean;
}

export function SpeakButton({
  text,
  withPronoun,
  size = "icon-sm",
  variant = "ghost",
  className,
  stopPropagation = true,
}: Props) {
  const { mode, voice } = useTts();
  const [loading, setLoading] = useState(false);

  const fullText = withPronoun ? `${withPronoun} ${text}` : text;

  const onClick = async (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (loading) return;
    setLoading(true);
    try {
      await speak(mode, fullText, voice);
    } finally {
      setLoading(false);
    }
  };

  const sizeClass =
    size === "icon-sm"
      ? "h-7 w-7"
      : size === "icon"
        ? "h-9 w-9"
        : "h-10 px-3";

  return (
    <Button
      type="button"
      variant={variant}
      onClick={onClick}
      aria-label={`Pronounce: ${fullText}`}
      title={`Pronounce "${fullText}" (${mode})`}
      className={cn(sizeClass, "shrink-0", className)}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Volume2 className="h-4 w-4" />
      )}
    </Button>
  );
}
