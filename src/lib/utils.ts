import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeDays(days: number): string {
  if (days < 1) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days} days`;
  if (days < 30) return `in ${Math.round(days / 7)} weeks`;
  if (days < 365) return `in ${Math.round(days / 30)} months`;
  return `in ${Math.round(days / 365)} years`;
}

export function formatDateShort(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(d);
}

/** Guess the browser timezone, safe for SSR. */
export function guessTimezone(): string {
  if (typeof Intl === "undefined") return "UTC";
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
