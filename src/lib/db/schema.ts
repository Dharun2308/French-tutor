import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ---------- verbs ----------
export const verbs = sqliteTable(
  "verbs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    infinitive: text("infinitive").notNull().unique(),
    english: text("english").notNull(),
    // "1" | "2" | "3" | "irregular"
    group: text("group").notNull(),
    // A1..C2
    level: text("level").notNull(),
    // passé composé auxiliary: "avoir" | "etre"
    auxiliary: text("auxiliary").notNull().default("avoir"),
    frequencyRank: integer("frequency_rank").notNull().default(999),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    levelIdx: index("verbs_level_idx").on(t.level),
    groupIdx: index("verbs_group_idx").on(t.group),
  })
);

// ---------- conjugations ----------
export const conjugations = sqliteTable(
  "conjugations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    verbId: integer("verb_id")
      .notNull()
      .references(() => verbs.id, { onDelete: "cascade" }),
    // present | imparfait | passe_compose | futur_proche | futur_simple | conditionnel
    tense: text("tense").notNull(),
    // 1s | 2s | 3s | 1p | 2p | 3p
    person: text("person").notNull(),
    // conjugated form, e.g. "parle", "ai parlé", "vais parler"
    form: text("form").notNull(),
    isIrregular: integer("is_irregular", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (t) => ({
    uniq: uniqueIndex("conjugations_unique_idx").on(t.verbId, t.tense, t.person),
    tenseIdx: index("conjugations_tense_idx").on(t.tense),
  })
);

// ---------- cards (1:1 with conjugations, holds SRS state) ----------
export const cards = sqliteTable(
  "cards",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    conjugationId: integer("conjugation_id")
      .notNull()
      .references(() => conjugations.id, { onDelete: "cascade" })
      .unique(),
    // SM-2 state
    easeFactor: integer("ease_factor_x100").notNull().default(250), // store as int*100
    intervalDays: integer("interval_days").notNull().default(0),
    repetitions: integer("repetitions").notNull().default(0),
    nextReviewAt: integer("next_review_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    lastReviewedAt: integer("last_reviewed_at", { mode: "timestamp_ms" }),
    correctCount: integer("correct_count").notNull().default(0),
    wrongCount: integer("wrong_count").notNull().default(0),
    suspended: integer("suspended", { mode: "boolean" })
      .notNull()
      .default(false),
    // AI-generated memory hook, filled in once a card becomes a leech
    // (failed repeatedly). Nullable — most cards never need one.
    mnemonic: text("mnemonic"),
  },
  (t) => ({
    dueIdx: index("cards_due_idx").on(t.nextReviewAt, t.suspended),
  })
);

// ---------- sessions (for streak + stats) ----------
export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: integer("started_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  endedAt: integer("ended_at", { mode: "timestamp_ms" }),
  mode: text("mode").notNull(),
  attempted: integer("attempted").notNull().default(0),
  correct: integer("correct").notNull().default(0),
});

// ---------- settings (singleton row) ----------
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey().default(1),
  dailyTarget: integer("daily_target").notNull().default(20),
  // JSON arrays as text
  activeTenses: text("active_tenses", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`(json_array('present'))`),
  activeLevels: text("active_levels", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`(json_array('A1'))`),
  // preferred register hint for AI: "formal" | "neutral" | "informal" | "all"
  preferredRegister: text("preferred_register").notNull().default("all"),
  modelOverride: text("model_override"),
  // "browser" (Web Speech API) or "openai" (gpt-4o-mini-tts)
  ttsMode: text("tts_mode").notNull().default("browser"),
  ttsVoice: text("tts_voice").notNull().default("alloy"),
  // "newcomer" | "foundations" | "present" | "past" | "advanced"
  // UI-only concept; selecting a stage presets activeTenses + activePhraseCategories.
  learningStage: text("learning_stage").notNull().default("present"),
  // Which phrase categories to include in phrases practice.
  // Default as a string literal so it's a constant (SQLite won't ALTER TABLE
  // ADD COLUMN with a non-constant default like json_array(...)).
  activePhraseCategories: text("active_phrase_categories", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(
      sql`'["article","number","question","greeting","phrase"]'`
    ),
  // IANA timezone, e.g. "America/Los_Angeles"
  timezone: text("timezone").notNull().default("UTC"),
  // Which structured-AI providers may be used (Import Lesson Notes, item
  // grading). Order is fixed in code (codex → claude → openai); this only
  // switches each one on/off. Constant default — see activePhraseCategories.
  extractProviders: text("extract_providers", { mode: "json" })
    .$type<Record<string, boolean>>()
    .notNull()
    .default(sql`'{"codex":true,"claude":true,"openai":false}'`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// ---------- phrases ----------
// Foundational content that isn't verb-conjugation: articles, numbers,
// alphabet, question words, greetings, common phrases. SRS state lives
// directly on the row because it's a 1:1 relationship (unlike verbs which
// have 36 conjugations each).
export const phrases = sqliteTable(
  "phrases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // "article" | "number" | "alphabet" | "question" | "greeting" | "phrase"
    category: text("category").notNull(),
    french: text("french").notNull(),
    english: text("english").notNull(),
    notes: text("notes"),
    level: text("level").notNull(),
    frequencyRank: integer("frequency_rank").notNull().default(999),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    // SRS state (same SM-2 math as cards)
    easeFactor: integer("ease_factor_x100").notNull().default(250),
    intervalDays: integer("interval_days").notNull().default(0),
    repetitions: integer("repetitions").notNull().default(0),
    nextReviewAt: integer("next_review_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    lastReviewedAt: integer("last_reviewed_at", { mode: "timestamp_ms" }),
    correctCount: integer("correct_count").notNull().default(0),
    wrongCount: integer("wrong_count").notNull().default(0),
    suspended: integer("suspended", { mode: "boolean" })
      .notNull()
      .default(false),
    // AI-generated memory hook for leeches (see cards.mnemonic).
    mnemonic: text("mnemonic"),
  },
  (t) => ({
    categoryIdx: index("phrases_category_idx").on(t.category),
    dueIdx: index("phrases_due_idx").on(t.nextReviewAt, t.suspended),
    uniq: uniqueIndex("phrases_french_category_english_idx").on(
      t.french,
      t.category,
      t.english
    ),
  })
);

// ---------- sentence_examples (AI cache) ----------
export const sentenceExamples = sqliteTable(
  "sentence_examples",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    verbId: integer("verb_id")
      .notNull()
      .references(() => verbs.id, { onDelete: "cascade" }),
    tense: text("tense").notNull(),
    promptHash: text("prompt_hash").notNull(),
    promptEn: text("prompt_en").notNull(),
    formal: text("formal").notNull(),
    neutral: text("neutral").notNull(),
    informal: text("informal").notNull(),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    uniq: uniqueIndex("sentence_examples_unique_idx").on(
      t.verbId,
      t.tense,
      t.promptHash
    ),
  })
);

// ---------- import_batches (one row per notebook scan or pasted note) ----------
// The extraction result is stored here verbatim so the approval screen is a
// real page that can be reloaded (phone browsers kill tabs), not client state.
export const importBatches = sqliteTable("import_batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  // "photo" | "text"
  sourceKind: text("source_kind").notNull(),
  // File names under uploads/<id>/ — resolved server-side, never from the client.
  imageFiles: text("image_files", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  rawText: text("raw_text"),
  label: text("label"),
  model: text("model"),
  extractedJson: text("extracted_json", { mode: "json" }).$type<unknown>(),
  // "pending" | "reviewed" | "discarded"
  status: text("status").notNull().default("pending"),
  itemCount: integer("item_count").notNull().default(0),
  // Free-text context the user typed ("iTalki with Marie, passé composé").
  note: text("note"),
  // Every provider attempt for the last extraction run, in order tried.
  providerLog: text("provider_log", { mode: "json" })
    .$type<
      { provider: string; ok: boolean; ms: number; model: string | null; error: string | null }[]
    >()
    .notNull()
    .default(sql`'[]'`),
  // Set when every provider failed; cleared on a successful retry.
  extractError: text("extract_error"),
});

// ---------- learning_items (personal items from lessons) ----------
// Separate from `phrases`/`cards` on purpose: these are user-approved, tutor-
// sourced items that get their own scheduler (FSRS, Phase 2). Content-only
// for now; scheduling columns arrive with Phase 2.
export const learningItems = sqliteTable(
  "learning_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    french: text("french").notNull(),
    english: text("english").notNull(),
    exampleFr: text("example_fr").notNull().default(""),
    exampleEn: text("example_en").notNull().default(""),
    // phrase | vocabulary | grammar | correction | pronunciation
    type: text("type").notNull(),
    grammarTopic: text("grammar_topic").notNull().default(""),
    cefrLevel: text("cefr_level").notNull().default("A2"),
    // 1 (marginal) .. 5 (tutor correction / must-use)
    priority: integer("priority").notNull().default(3),
    sourceContext: text("source_context").notNull().default(""),
    batchId: integer("batch_id").references(() => importBatches.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    // Dedupe key (see lib/import/norm-key.ts). Re-importing the same phrase
    // bumps the counters below instead of creating a second row.
    normKey: text("norm_key").notNull(),
    encounterCount: integer("encounter_count").notNull().default(1),
    importanceScore: integer("importance_score").notNull().default(0),
    // Examples collected from later encounters: [{fr, en, batchId}]
    extraExamples: text("extra_examples", { mode: "json" })
      .$type<{ fr: string; en: string; batchId: number | null }[]>()
      .notNull()
      .default(sql`'[]'`),

    // ---- FSRS state (see lib/fsrs.ts) ----
    // 0 New · 1 Learning · 2 Review · 3 Relearning
    fsrsState: integer("fsrs_state").notNull().default(0),
    stability: real("stability").notNull().default(0),
    difficulty: real("difficulty").notNull().default(0),
    elapsedDays: integer("elapsed_days").notNull().default(0),
    scheduledDays: integer("scheduled_days").notNull().default(0),
    learningSteps: integer("learning_steps").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    // Constant default (epoch) rather than unixepoch(): SQLite refuses
    // non-constant defaults on ADD COLUMN. 0 simply means "due now".
    dueAt: integer("due_at", { mode: "timestamp_ms" }).notNull().default(sql`0`),
    lastReviewedAt: integer("last_reviewed_at", { mode: "timestamp_ms" }),

    // ---- learning metrics ----
    reviewCount: integer("review_count").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    lastFailureAt: integer("last_failure_at", { mode: "timestamp_ms" }),
    // Tutor Mode (Phase 3): "used naturally" in a real lesson.
    spontaneousUsageCount: integer("spontaneous_usage_count").notNull().default(0),
    // Per-direction accuracy — one schedule per item, three masteries.
    productionSeen: integer("production_seen").notNull().default(0),
    productionCorrect: integer("production_correct").notNull().default(0),
    recognitionSeen: integer("recognition_seen").notNull().default(0),
    recognitionCorrect: integer("recognition_correct").notNull().default(0),
    listeningSeen: integer("listening_seen").notNull().default(0),
    listeningCorrect: integer("listening_correct").notNull().default(0),
    suspended: integer("suspended", { mode: "boolean" }).notNull().default(false),
  },
  (t) => ({
    dueIdx: index("learning_items_due_idx").on(t.dueAt, t.suspended),
    normKeyUniq: uniqueIndex("learning_items_norm_key_idx").on(t.normKey),
    typeIdx: index("learning_items_type_idx").on(t.type),
    batchIdx: index("learning_items_batch_idx").on(t.batchId),
  })
);

export type Verb = typeof verbs.$inferSelect;
export type NewVerb = typeof verbs.$inferInsert;
export type Conjugation = typeof conjugations.$inferSelect;
export type NewConjugation = typeof conjugations.$inferInsert;
export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type Phrase = typeof phrases.$inferSelect;
export type NewPhrase = typeof phrases.$inferInsert;
export type SentenceExample = typeof sentenceExamples.$inferSelect;
// ---------- item_reviews (append-only review log for learning_items) ----------
// The weak-items engine, per-skill accuracy and the weekly review all need
// history, and history cannot be backfilled — so it is written from day one.
export const itemReviews = sqliteTable(
  "item_reviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => learningItems.id, { onDelete: "cascade" }),
    ratedAt: integer("rated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    // 0 Again · 1 Hard · 2 Good · 3 Easy (same scale as RateButtons)
    rating: integer("rating").notNull(),
    // production | recognition | listening
    direction: text("direction").notNull().default("production"),
    // CORRECT | ACCEPTABLE | MINOR_ERROR | WRONG | UNGRADED (AI unavailable)
    verdict: text("verdict"),
    errorType: text("error_type"),
    userAnswer: text("user_answer"),
    correctedAnswer: text("corrected_answer"),
    gradeReason: text("grade_reason"),
    elapsedMs: integer("elapsed_ms"),
    // Which provider graded it (local | codex | claude | openai), if any.
    gradedBy: text("graded_by"),
    // FSRS snapshot after this rating.
    stabilityAfter: real("stability_after"),
    difficultyAfter: real("difficulty_after"),
    scheduledDays: integer("scheduled_days"),
  },
  (t) => ({
    itemIdx: index("item_reviews_item_idx").on(t.itemId, t.ratedAt),
    ratedIdx: index("item_reviews_rated_idx").on(t.ratedAt),
  })
);

// ---------- active_selections (weekly speaking focus) ----------
export const activeSelections = sqliteTable(
  "active_selections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => learningItems.id, { onDelete: "cascade" }),
    weekStart: integer("week_start", { mode: "timestamp_ms" }).notNull(),
    position: integer("position").notNull(),
    // auto | pinned | replacement
    source: text("source").notNull().default("auto"),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    scoreSnapshot: real("score_snapshot").notNull(),
    reasons: text("reasons_json", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    selectedAt: integer("selected_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    itemWeekUniq: uniqueIndex("active_selections_item_week_idx").on(t.weekStart, t.itemId),
    positionWeekUniq: uniqueIndex("active_selections_position_week_idx").on(
      t.weekStart,
      t.position
    ),
    weekIdx: index("active_selections_week_idx").on(t.weekStart, t.pinned, t.position),
  })
);

// ---------- tutor_usage_events (real conversation evidence) ----------
export const tutorUsageEvents = sqliteTable(
  "tutor_usage_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    submissionId: text("submission_id").notNull(),
    itemId: integer("item_id")
      .notNull()
      .references(() => learningItems.id, { onDelete: "cascade" }),
    weekStart: integer("week_start", { mode: "timestamp_ms" }).notNull(),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    // natural | helped | not_used
    outcome: text("outcome").notNull(),
  },
  (t) => ({
    submissionItemUniq: uniqueIndex("tutor_usage_submission_item_idx").on(
      t.submissionId,
      t.itemId
    ),
    itemAtIdx: index("tutor_usage_item_at_idx").on(t.itemId, t.occurredAt),
  })
);

// ---------- error_patterns (projection; item_reviews is source of truth) ----------
export const errorPatterns = sqliteTable(
  "error_patterns",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    patternKey: text("pattern_key").notNull(),
    errorType: text("error_type").notNull(),
    grammarTopic: text("grammar_topic").notNull().default(""),
    totalCount: integer("total_count").notNull().default(0),
    firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
    lastItemId: integer("last_item_id").references(() => learningItems.id, {
      onDelete: "set null",
    }),
  },
  (t) => ({
    keyUniq: uniqueIndex("error_patterns_key_idx").on(t.patternKey),
    lastSeenIdx: index("error_patterns_last_seen_idx").on(t.lastSeenAt),
  })
);

// ---------- provider_events (every structured-AI attempt, for the status UI) ----------
export const providerEvents = sqliteTable(
  "provider_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    at: integer("at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    // extract | grade | test
    purpose: text("purpose").notNull(),
    // codex | claude | openai
    provider: text("provider").notNull(),
    ok: integer("ok", { mode: "boolean" }).notNull(),
    ms: integer("ms").notNull(),
    model: text("model"),
    error: text("error"),
    batchId: integer("batch_id"),
  },
  (t) => ({
    providerIdx: index("provider_events_provider_idx").on(t.provider, t.at),
  })
);

export type ImportBatch = typeof importBatches.$inferSelect;
export type LearningItem = typeof learningItems.$inferSelect;
export type NewLearningItem = typeof learningItems.$inferInsert;
export type ItemReview = typeof itemReviews.$inferSelect;
export type ProviderEvent = typeof providerEvents.$inferSelect;
export type ActiveSelection = typeof activeSelections.$inferSelect;
export type TutorUsageEvent = typeof tutorUsageEvents.$inferSelect;
export type ErrorPattern = typeof errorPatterns.$inferSelect;
