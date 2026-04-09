"use client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RATING_LABELS, type Rating } from "@/types";

interface Props {
  onRate: (rating: Rating) => void;
  disabled?: boolean;
}

const BUTTONS: { rating: Rating; variant: "destructive" | "outline" | "default" | "success"; hint: string }[] = [
  { rating: 0, variant: "destructive", hint: "1" },
  { rating: 1, variant: "outline", hint: "2" },
  { rating: 2, variant: "default", hint: "3" },
  { rating: 3, variant: "success", hint: "4" },
];

export function RateButtons({ onRate, disabled }: Props) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {BUTTONS.map((b) => (
        <Button
          key={b.rating}
          variant={b.variant}
          disabled={disabled}
          onClick={() => onRate(b.rating)}
          className="flex-col h-auto py-3"
        >
          <span className="text-sm font-semibold">{RATING_LABELS[b.rating]}</span>
          <span className={cn("text-[10px] font-mono opacity-70")}>[{b.hint}]</span>
        </Button>
      ))}
    </div>
  );
}
