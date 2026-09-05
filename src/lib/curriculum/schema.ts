import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { SessionData, TopicGrade, TopicState, ErrorTag, Stage } from "./types";

export const topicProgress = sqliteTable("topic_progress", {
  topicId: text("topic_id").primaryKey(),
  state: text("state").$type<TopicState>().notNull(),
  theoryUnderstood: integer("theory_understood", { mode: "boolean" }).notNull().default(false),
  teachBack: text("teach_back"),
  maintenanceStep: integer("maintenance_step").notNull().default(0),
  dueAt: integer("due_at", { mode: "timestamp_ms" }),
  maintenanceDueAt: integer("maintenance_due_at", { mode: "timestamp_ms" }),
  needsTheory: integer("needs_theory", { mode: "boolean" }).notNull().default(false),
  lastStudiedAt: integer("last_studied_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
});
export const topicSessions = sqliteTable("topic_sessions", {
  id: text("id").primaryKey(),
  topicId: text("topic_id").notNull(),
  data: text("data", { mode: "json" }).$type<SessionData>().notNull(),
  revision: integer("revision").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
}, (t) => ({ topicIdx: index("topic_session_topic_idx").on(t.topicId) }));
export const topicAttempts = sqliteTable("topic_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id").notNull(),
  questionId: text("question_id").notNull(),
  topicId: text("topic_id").notNull(),
  stage: text("stage").$type<Exclude<Stage, "theory">>().notNull(),
  answer: text("answer").notNull(),
  grade: text("grade", { mode: "json" }).$type<TopicGrade>().notNull(),
  independent: integer("independent", { mode: "boolean" }).notNull(),
  remediation: integer("remediation", { mode: "boolean" }).notNull(),
  spoken: integer("spoken", { mode: "boolean" }).notNull().default(false),
  elapsedMs: integer("elapsed_ms").notNull(),
  at: integer("at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
}, (t) => ({ questionUniq: uniqueIndex("topic_attempt_question_idx").on(t.sessionId, t.questionId), topicIdx: index("topic_attempt_topic_idx").on(t.topicId, t.at) }));
export const topicErrors = sqliteTable("topic_errors", {
  topicId: text("topic_id").notNull(), tag: text("tag").$type<ErrorTag>().notNull(),
  misses: integer("misses").notNull().default(0),
  streak: integer("streak").notNull().default(0),
  weight: integer("weight").notNull().default(0),
  reviewAt: integer("review_at", { mode: "timestamp_ms" }),
  lastMissAt: integer("last_miss_at", { mode: "timestamp_ms" }),
}, (t) => ({ uniq: uniqueIndex("topic_error_tag_idx").on(t.topicId, t.tag) }));
