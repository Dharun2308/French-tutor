import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { SmartData } from "./types";

export const smartSessions = sqliteTable("smart_sessions", {
  id: text("id").primaryKey(),
  status: text("status").$type<"active" | "completed" | "abandoned">().notNull(),
  revision: integer("revision").notNull().default(0),
  data: text("data", { mode: "json" }).$type<SmartData>().notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
}, t => ({ oneActive: uniqueIndex("smart_sessions_one_active").on(t.status).where(sql`${t.status} = 'active'`) }));
