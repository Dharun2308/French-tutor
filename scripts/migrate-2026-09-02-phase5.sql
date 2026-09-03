PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS focus_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  started_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  ended_at INTEGER,
  plan_json TEXT NOT NULL DEFAULT '[]',
  current_index INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS weekly_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  week_start INTEGER NOT NULL,
  generated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  facts_hash TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS weekly_summaries_week_idx ON weekly_summaries(week_start);
