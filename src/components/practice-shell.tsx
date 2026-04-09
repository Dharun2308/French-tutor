"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface Props {
  title: string;
  subtitle?: string;
  current: number;
  total: number;
  children: React.ReactNode;
}

export function PracticeShell({ title, subtitle, current, total, children }: Props) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="container max-w-2xl py-8">
      <div className="mb-6 flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
        </Button>
        <div className="text-sm text-muted-foreground">
          {current} / {total}
        </div>
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        )}
        <Progress value={pct} className="mt-4" />
      </div>
      {children}
    </div>
  );
}
