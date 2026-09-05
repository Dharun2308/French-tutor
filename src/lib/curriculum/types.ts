export const TOPIC_STATES = ["NOT_STARTED", "LEARNING_THEORY", "CONTROLLED_PRACTICE", "PRODUCTION_PRACTICE", "85_PERCENT_REACHED", "MAINTENANCE", "AUTOMATIC", "REVISIT_REQUIRED"] as const;
export type TopicState = typeof TOPIC_STATES[number];
export const STATE_LABELS: Record<TopicState, string> = {
  NOT_STARTED: "New", LEARNING_THEORY: "Learning the rule", CONTROLLED_PRACTICE: "Guided practice",
  PRODUCTION_PRACTICE: "Building accuracy", "85_PERCENT_REACHED": "Ready for maintenance",
  MAINTENANCE: "Spaced review", AUTOMATIC: "Automatic", REVISIT_REQUIRED: "Needs a revisit",
};
export const ERROR_TAGS = ["ARTICLE_NEGATION", "GENDER_NUMBER_AGREEMENT", "GENDER_AGREEMENT", "ADJECTIVE_PLACEMENT", "ETRE_AVOIR", "PC_IMPARFAIT", "QUI_QUE", "QUESTION_STRUCTURE", "PREPOSITION_CONTRACTION", "REFLEXIVE_VERBS", "PRONOUN_PLACEMENT", "PRONOUN_SELECTION", "VERB_FORM", "ARTICLE_SELECTION", "POSSESSIVE_AGREEMENT", "GEOGRAPHICAL_PREPOSITION", "ADVERB_PLACEMENT", "QUANTITY_DE", "LISTENING_DISCRIMINATION", "VOCABULARY", "OTHER"] as const;
export type ErrorTag = typeof ERROR_TAGS[number];
export type Stage = "theory" | "controlled" | "production" | "targeted" | "mixed" | "oral";
export interface Topic {
  id: string; title: string; group: string; coverage: "practiced" | "partial" | "new" | "later";
  notes: string; tags: ErrorTag[]; priority: number; prerequisites: string[];
  kind: "grammar" | "pronunciation" | "communication";
}
export interface Theory {
  meaning: string; usage: string; formation: string; caution: string;
  examples: { french: string; english: string }[]; teachBack: string;
}
export interface Question {
  id: string; topicId: string; stage: Exclude<Stage, "theory">; prompt: string;
  answer: string; hint: string; rule: string; tag: ErrorTag; audio: string;
  remediation: boolean; hinted: boolean;
  ungraded?: boolean;
}
export interface TopicGrade {
  ungraded?: boolean;
  conceptCorrect: boolean; corrected: string; explanation: string;
  minorOnly: boolean; errorTags: ErrorTag[];
}
export interface SessionData {
  mode: "learn" | "revisit" | "mixed" | "oral" | "theory";
  stage: Stage; theory: Theory | null; questions: Question[];
  current: number; target: number; focusTags: ErrorTag[];
  feedback: (TopicGrade & { submitted: string; questionId: string; provider: string; revealed: boolean }) | null;
  provider: string | null; result: string | null; completed: boolean;
  outcome?: "pass" | "targeted" | "reteach" | "insufficient" | "left";
}
