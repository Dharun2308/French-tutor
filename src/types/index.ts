// Shared enums and types used across the app.

export const TENSES = [
  "present",
  "imparfait",
  "passe_compose",
  "futur_proche",
  "futur_simple",
  "conditionnel",
] as const;

export type Tense = (typeof TENSES)[number];

export const TENSE_LABELS: Record<Tense, string> = {
  present: "Présent",
  imparfait: "Imparfait",
  passe_compose: "Passé composé",
  futur_proche: "Futur proche",
  futur_simple: "Futur simple",
  conditionnel: "Conditionnel présent",
};

export const PERSONS = ["1s", "2s", "3s", "1p", "2p", "3p"] as const;
export type Person = (typeof PERSONS)[number];

export const PERSON_PRONOUNS: Record<Person, string> = {
  "1s": "je",
  "2s": "tu",
  "3s": "il/elle",
  "1p": "nous",
  "2p": "vous",
  "3p": "ils/elles",
};

export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Level = (typeof LEVELS)[number];

export const VERB_GROUPS = ["1", "2", "3", "irregular"] as const;
export type VerbGroup = (typeof VERB_GROUPS)[number];

export const REGISTERS = ["formal", "neutral", "informal"] as const;
export type Register = (typeof REGISTERS)[number];

// SRS rating — four buckets mapped to SM-2 update logic.
export const RATINGS = [0, 1, 2, 3] as const;
export type Rating = (typeof RATINGS)[number];

export const RATING_LABELS: Record<Rating, string> = {
  0: "Again",
  1: "Hard",
  2: "Good",
  3: "Easy",
};

// Grader verdict returned from /api/ai/grade.
export type Verdict = "correct" | "minor" | "major" | "wrong";

export const PRACTICE_MODES = [
  "drill",
  "flashcards",
  "multiple_choice",
  "sentence",
  "phrases",
] as const;
export type PracticeMode = (typeof PRACTICE_MODES)[number];

export const PHRASE_CATEGORIES = [
  "article",
  "number",
  "alphabet",
  "question",
  "greeting",
  "phrase",
] as const;
export type PhraseCategory = (typeof PHRASE_CATEGORIES)[number];

export const PHRASE_CATEGORY_LABELS: Record<PhraseCategory, string> = {
  article: "Articles",
  number: "Numbers",
  alphabet: "Alphabet",
  question: "Question words",
  greeting: "Greetings",
  phrase: "Common phrases",
};

export const LEARNING_STAGES = [
  "newcomer",
  "foundations",
  "present",
  "past",
  "advanced",
] as const;
export type LearningStage = (typeof LEARNING_STAGES)[number];

export interface StagePreset {
  label: string;
  description: string;
  activeTenses: Tense[];
  activeLevels: Level[];
  activePhraseCategories: PhraseCategory[];
}

/**
 * Presets applied when the user picks a Learning Stage. They're one-click
 * shortcuts — users can still override individual toggles after picking one.
 */
export const STAGE_PRESETS: Record<LearningStage, StagePreset> = {
  newcomer: {
    label: "Newcomer",
    description:
      "Just starting. Alphabet, numbers, articles, and simple greetings. No verbs yet.",
    activeTenses: [],
    activeLevels: ["A1"],
    activePhraseCategories: ["article", "number", "alphabet", "greeting"],
  },
  foundations: {
    label: "Foundations",
    description:
      "Basic vocabulary: articles, numbers, question words, greetings, common phrases. Still no verb conjugations.",
    activeTenses: [],
    activeLevels: ["A1"],
    activePhraseCategories: ["article", "number", "question", "greeting", "phrase"],
  },
  present: {
    label: "Present tense verbs",
    description:
      "Foundations plus present-tense verb conjugations. Recommended if you've learned subject pronouns + basic verb forms.",
    activeTenses: ["present"],
    activeLevels: ["A1"],
    activePhraseCategories: ["article", "number", "question", "greeting", "phrase"],
  },
  past: {
    label: "Past tenses",
    description:
      "Add passé composé, imparfait, and futur proche to your active tenses.",
    activeTenses: ["present", "passe_compose", "imparfait", "futur_proche"],
    activeLevels: ["A1", "A2"],
    activePhraseCategories: ["article", "number", "question", "greeting", "phrase"],
  },
  advanced: {
    label: "Advanced",
    description:
      "All tenses unlocked, including futur simple and conditionnel. A1 + A2 verbs.",
    activeTenses: [
      "present",
      "passe_compose",
      "imparfait",
      "futur_proche",
      "futur_simple",
      "conditionnel",
    ],
    activeLevels: ["A1", "A2"],
    activePhraseCategories: ["article", "number", "question", "greeting", "phrase"],
  },
};
