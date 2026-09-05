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
  "country",
  "city",
  "time",
  "food",
  "fruit_vegetable",
  "meat",
  "quantity",
  "nationality",
  "demonstrative",
  "vocabulary",
  "expression",
  "activity",
  "shopping",
  "colour",
  "clothing",
  "weather",
  "sentence",
  "fill_article",
  "fill_preposition",
  "fill_question",
  "fill_phrase",
  "fill_number",
  "fill_time",
  "fill_vocabulary",
] as const;
export type PhraseCategory = (typeof PHRASE_CATEGORIES)[number];

export const PHRASE_CATEGORY_LABELS: Record<PhraseCategory, string> = {
  article: "Articles",
  number: "Numbers",
  alphabet: "Alphabet",
  question: "Question words",
  greeting: "Greetings",
  phrase: "Common phrases",
  country: "Countries & prepositions",
  city: "Cities",
  time: "Time expressions",
  food: "Food",
  fruit_vegetable: "Fruits & vegetables",
  meat: "Meat & protein",
  quantity: "Quantities & weights",
  nationality: "Nationalities",
  demonstrative: "Demonstratives",
  vocabulary: "Vocabulary",
  expression: "Useful expressions",
  activity: "Activities & hobbies",
  shopping: "Shopping",
  colour: "Colours",
  clothing: "Clothing",
  weather: "Weather",
  sentence: "Sentences",
  fill_article: "Fill: Articles",
  fill_preposition: "Fill: Prepositions",
  fill_question: "Fill: Questions",
  fill_phrase: "Fill: Phrases",
  fill_number: "Fill: Numbers",
  fill_time: "Fill: Days & months",
  fill_vocabulary: "Fill: Vocabulary",
};

/** Categories that are fill-in-the-blank exercises (not flashcard-style). */
export const FILL_BLANK_CATEGORIES: PhraseCategory[] = [
  "fill_article",
  "fill_preposition",
  "fill_question",
  "fill_phrase",
  "fill_number",
  "fill_time",
  "fill_vocabulary",
];

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
      "Basic vocabulary: articles, numbers, question words, greetings, common phrases, countries, cities, time, food, quantities, colours, clothing, weather + fill-in-the-blank drills.",
    activeTenses: [],
    activeLevels: ["A1"],
    activePhraseCategories: ["article", "number", "question", "greeting", "phrase", "country", "city", "time", "food", "fruit_vegetable", "meat", "quantity", "nationality", "demonstrative", "vocabulary", "expression", "activity", "shopping", "colour", "clothing", "weather", "sentence", "fill_article", "fill_preposition", "fill_question", "fill_phrase", "fill_number", "fill_time", "fill_vocabulary"],
  },
  present: {
    label: "Present tense verbs",
    description:
      "Foundations plus present-tense verb conjugations. Recommended if you've learned subject pronouns + basic verb forms.",
    activeTenses: ["present"],
    activeLevels: ["A1"],
    activePhraseCategories: ["article", "number", "question", "greeting", "phrase", "country", "city", "time", "food", "fruit_vegetable", "meat", "quantity", "nationality", "demonstrative", "vocabulary", "expression", "activity", "shopping", "colour", "clothing", "weather", "sentence", "fill_article", "fill_preposition", "fill_question", "fill_phrase", "fill_number", "fill_time", "fill_vocabulary"],
  },
  past: {
    label: "Past tenses",
    description:
      "Add passé composé, imparfait, and futur proche to your active tenses.",
    activeTenses: ["present", "passe_compose", "imparfait", "futur_proche"],
    activeLevels: ["A1", "A2"],
    activePhraseCategories: ["article", "number", "question", "greeting", "phrase", "country", "city", "time", "food", "fruit_vegetable", "meat", "quantity", "nationality", "demonstrative", "vocabulary", "expression", "activity", "shopping", "colour", "clothing", "weather", "sentence", "fill_article", "fill_preposition", "fill_question", "fill_phrase", "fill_number", "fill_time", "fill_vocabulary"],
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
    activePhraseCategories: ["article", "number", "question", "greeting", "phrase", "country", "city", "time", "food", "fruit_vegetable", "meat", "quantity", "nationality", "demonstrative", "vocabulary", "expression", "activity", "shopping", "colour", "clothing", "weather", "sentence", "fill_article", "fill_preposition", "fill_question", "fill_phrase", "fill_number", "fill_time", "fill_vocabulary"],
  },
};

// ---------- Lesson-note learning items (imported from notebook photos) ----------
export const LEARNING_ITEM_TYPES = [
  "phrase",
  "vocabulary",
  "grammar",
  "correction",
  "pronunciation",
] as const;
export type LearningItemType = (typeof LEARNING_ITEM_TYPES)[number];

export const LEARNING_ITEM_TYPE_LABELS: Record<LearningItemType, string> = {
  phrase: "Phrase",
  vocabulary: "Vocabulary",
  grammar: "Grammar",
  correction: "Correction",
  pronunciation: "Pronunciation",
};

/** CEFR band an imported item is pitched at (the extractor never goes above B2). */
export const ITEM_CEFR_LEVELS = ["A1", "A2", "B1", "B2"] as const;
export type ItemCefrLevel = (typeof ITEM_CEFR_LEVELS)[number];

export const IMPORT_BATCH_STATUSES = ["pending", "reviewed", "discarded"] as const;
export type ImportBatchStatus = (typeof IMPORT_BATCH_STATUSES)[number];

// ---------- AI providers for structured calls (extraction, grading) ----------
// Fixed fallback order. The two CLI providers run under the user's ChatGPT /
// Claude subscriptions; the API provider bills per call and is enabled as the final fallback.
export const PROVIDER_ORDER = ["codex", "claude", "openai"] as const;
export type ProviderId = (typeof PROVIDER_ORDER)[number];

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  codex: "Codex (ChatGPT Pro)",
  claude: "Claude Code (Claude Pro)",
  openai: "OpenAI API (billed per call)",
};

export const DEFAULT_EXTRACT_PROVIDERS: Record<ProviderId, boolean> = {
  codex: true,
  claude: true,
  openai: true,
};

// ---------- Lesson-item review ----------
export const REVIEW_DIRECTIONS = ["production", "recognition", "listening"] as const;
export type ReviewDirection = (typeof REVIEW_DIRECTIONS)[number];

export const ITEM_VERDICTS = ["CORRECT", "ACCEPTABLE", "MINOR_ERROR", "WRONG"] as const;
export type ItemVerdict = (typeof ITEM_VERDICTS)[number];

export const ITEM_ERROR_TYPES = [
  "none",
  "typo",
  "accent",
  "conjugation",
  "tense",
  "agreement",
  "article",
  "preposition",
  "negation",
  "word_order",
  "vocabulary",
  "register",
  "other",
] as const;
export type ItemErrorType = (typeof ITEM_ERROR_TYPES)[number];

export const TUTOR_USAGE_OUTCOMES = ["natural", "helped", "not_used"] as const;
export type TutorUsageOutcome = (typeof TUTOR_USAGE_OUTCOMES)[number];

export const ACTIVE_SELECTION_SOURCES = ["auto", "pinned", "replacement"] as const;
export type ActiveSelectionSource = (typeof ACTIVE_SELECTION_SOURCES)[number];
