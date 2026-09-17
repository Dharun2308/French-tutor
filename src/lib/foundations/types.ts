import type { Rating } from "@/types";
import type { SmartExercise, SmartGrade, SmartSource } from "@/lib/smart/types";

export type FoundationsMix = "blend" | "notes" | "everyday";
export type Challenge = "supported" | "standard" | "stretch";
export interface RecallMemory {
  again: number;
  hard: number;
  good: number;
  easy: number;
  recentStruggles: number;
  lastRating: Rating | null;
}
export interface FoundationsSource extends Omit<SmartSource, "kind"> {
  kind: "personal" | "phrase";
  dueAt: string;
  reviewed: boolean;
  memory: RecallMemory;
  challenge: Challenge;
  retryExercise?: SmartExercise;
}
export interface FoundationsQuestion {
  id: string;
  sourceKey: string;
  followUp: boolean;
  exercise?: SmartExercise;
  feedback?: {
    answer: string;
    grade: SmartGrade;
    revealed: boolean;
    elapsedMs: number;
    rating: Rating | null;
    dueAt: string | null;
  };
  skipped?: boolean;
}
export interface FoundationsData {
  version: 1 | 2;
  mix: FoundationsMix;
  sources: FoundationsSource[];
  queue: FoundationsQuestion[];
  index: number;
  activeTenses: string[];
  history: Array<{ prompt: string; target: string }>;
}
export interface FoundationsView {
  id: string;
  status: "active" | "completed" | "abandoned";
  mix: FoundationsMix;
  completed: number;
  total: number;
  ratings: Record<Rating, number>;
  followUps: number;
  skipped: number;
  notesAvailable: number;
  question: {
    id: string;
    label: string;
    reason: string;
    origin: "Lesson notes" | "Everyday French";
    challenge: Challenge;
    memory: RecallMemory;
    followUp: boolean;
    retry: boolean;
    prompt: string | null;
    provider: string | null;
    fallback: boolean;
    feedback: (NonNullable<FoundationsQuestion["feedback"]> & { modelAnswer: string }) | null;
  } | null;
  recap: Array<{ french: string; english: string; rating: Rating; explanation: string }>;
}
