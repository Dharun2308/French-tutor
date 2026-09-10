import type { ItemErrorType, Rating } from "@/types";

export interface SmartSource {
  key: string;
  kind: "personal" | "phrase" | "verb";
  id: number;
  label: string;
  reason: string;
  score: number;
  group: string;
  level: string;
  prompt: string;
  target: string;
  topic: string;
  evidence: string[];
  verb?: { infinitive: string; tense: string; person: string; form: string };
}

export interface SmartExercise {
  prompt: string;
  target: string;
  rubric: string;
  provider: string;
  fallback: boolean;
}

export interface SmartGrade {
  verdict: "CORRECT" | "MINOR_ERROR" | "WRONG" | "UNGRADED";
  corrected: string;
  explanation: string;
  errorType: ItemErrorType;
  provider: string;
}

export interface SmartQuestion {
  id: string;
  sourceKey: string;
  followUp: boolean;
  exercise?: SmartExercise;
  attempt?: {
    answer: string;
    grade: SmartGrade;
    rating: Rating | null;
    elapsedMs: number;
    scheduled: boolean;
  };
  skipped?: boolean;
}

export interface SmartData {
  version: 1;
  sources: SmartSource[];
  queue: SmartQuestion[];
  index: number;
  history: Array<{ prompt: string; target: string }>;
}

/** Only this projection crosses the API; private answers/rubrics stay on the server. */
export interface SmartView {
  id: string;
  status: "active" | "completed" | "abandoned";
  completed: number;
  total: number;
  independent: number;
  correct: number;
  followUps: number;
  skipped: number;
  focus: string[];
  question: {
    id: string;
    label: string;
    reason: string;
    followUp: boolean;
    prompt: string | null;
    provider: string | null;
    fallback: boolean;
    feedback: (SmartQuestion["attempt"] & { modelAnswer: string }) | null;
  } | null;
  recap: Array<{ label: string; correction: string; explanation: string }>;
}
