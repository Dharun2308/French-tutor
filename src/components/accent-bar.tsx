"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Common French accented characters. The user can click a button or hold
// Alt + the unaccented letter to insert one.
const CHARS: Array<{ char: string; alt: string }> = [
  { char: "é", alt: "e" },
  { char: "è", alt: "E" }, // alt+shift+e
  { char: "ê", alt: "3" },
  { char: "à", alt: "a" },
  { char: "â", alt: "2" },
  { char: "ç", alt: "c" },
  { char: "ù", alt: "u" },
  { char: "û", alt: "7" },
  { char: "î", alt: "i" },
  { char: "ï", alt: "I" },
  { char: "ô", alt: "o" },
  { char: "œ", alt: "O" },
];

export interface AccentBarProps {
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
}

export function AccentBar({ inputRef, value, onChange }: AccentBarProps) {
  const insert = (ch: string) => {
    const el = inputRef.current;
    if (!el) {
      onChange(value + ch);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + ch + value.slice(end);
    onChange(next);
    // Re-focus and put caret after the inserted character.
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + ch.length;
      el.setSelectionRange(pos, pos);
    });
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      const match = CHARS.find((c) => c.alt === e.key);
      if (!match) return;
      // Only intercept if focus is in our input
      if (document.activeElement !== inputRef.current) return;
      e.preventDefault();
      insert(match.char);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, inputRef]);

  return (
    <div className="flex flex-wrap gap-1">
      {CHARS.map((c) => (
        <Button
          key={c.char}
          type="button"
          variant="outline"
          size="sm"
          className="h-8 min-w-8 px-2 text-base font-serif"
          onClick={() => insert(c.char)}
          title={`Alt+${c.alt}`}
        >
          {c.char}
        </Button>
      ))}
    </div>
  );
}
