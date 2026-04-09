"use client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SpeakButton } from "@/components/speak-button";
import { cn } from "@/lib/utils";

interface Props {
  label: "Formal" | "Neutral" | "Informal";
  text: string;
  highlighted?: boolean;
}

const LABEL_COLORS = {
  Formal: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
  Neutral: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  Informal: "bg-amber-500/10 text-amber-600 dark:text-amber-500 border-amber-500/20",
};

export function RegisterCard({ label, text, highlighted }: Props) {
  return (
    <Card
      className={cn(
        "transition-all",
        highlighted && "ring-2 ring-primary/50"
      )}
    >
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className={cn("border", LABEL_COLORS[label])}>
            {label}
          </Badge>
          <SpeakButton text={text} />
        </div>
        <p className="text-base font-serif leading-relaxed">{text}</p>
      </CardContent>
    </Card>
  );
}
