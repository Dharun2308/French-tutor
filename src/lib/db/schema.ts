import { sql } from "drizzle-orm";
import {
  index,
  integer,
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
  // IANA timezone, e.g. "America/Los_Angeles"
  timezone: text("timezone").notNull().default("UTC"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

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

export type Verb = typeof verbs.$inferSelect;
export type NewVerb = typeof verbs.$inferInsert;
export type Conjugation = typeof conjugations.$inferSelect;
export type NewConjugation = typeof conjugations.$inferInsert;
export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type SentenceExample = typeof sentenceExamples.$inferSelect;
