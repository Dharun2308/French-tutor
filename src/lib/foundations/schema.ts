import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { Rating } from "@/types";
import type { SmartExercise, SmartGrade } from "@/lib/smart/types";
import type { FoundationsData } from "./types";

export const foundationsSessions = sqliteTable("foundations_sessions", {
  id: text("id").primaryKey(),
  status: text("status").$type<"active" | "completed" | "abandoned">().notNull(),
  revision: integer("revision").notNull().default(0),
  data: text("data", { mode: "json" }).$type<FoundationsData>().notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
}, t => ({ oneActive: uniqueIndex("foundations_one_active").on(t.status).where(sql`${t.status} = 'active'`) }));

// Every explicit button press is durable. Relearning is recorded separately from
// independent recall, and never advances the source's schedule a second time.
export const foundationsReviews = sqliteTable("foundations_reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id").notNull().references(() => foundationsSessions.id),
  questionId: text("question_id").notNull(),
  sourceKey: text("source_key").notNull(),
  rating: integer("rating").$type<Rating>().notNull(),
  independent: integer("independent", { mode: "boolean" }).notNull(),
  exercise: text("exercise", { mode: "json" }).$type<SmartExercise>().notNull(),
  answer: text("answer").notNull(),
  grade: text("grade", { mode: "json" }).$type<SmartGrade>().notNull(),
  revealed: integer("revealed", { mode: "boolean" }).notNull().default(false),
  ratedAt: integer("rated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
}, t => ({
  question: uniqueIndex("foundations_review_question").on(t.sessionId, t.questionId),
  source: index("foundations_review_source").on(t.sourceKey, t.independent, t.ratedAt),
}));
