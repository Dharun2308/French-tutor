CREATE TABLE IF NOT EXISTS topic_progress (
  topic_id TEXT PRIMARY KEY NOT NULL, state TEXT NOT NULL,
  theory_understood INTEGER NOT NULL DEFAULT 0, teach_back TEXT,
  maintenance_step INTEGER NOT NULL DEFAULT 0, due_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE TABLE IF NOT EXISTS topic_sessions (
  id TEXT PRIMARY KEY NOT NULL, topic_id TEXT NOT NULL, data TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS topic_session_topic_idx ON topic_sessions(topic_id);
CREATE TABLE IF NOT EXISTS topic_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, question_id TEXT NOT NULL,
  topic_id TEXT NOT NULL, stage TEXT NOT NULL, answer TEXT NOT NULL, grade TEXT NOT NULL,
  independent INTEGER NOT NULL, remediation INTEGER NOT NULL, spoken INTEGER NOT NULL DEFAULT 0,
  elapsed_ms INTEGER NOT NULL, at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS topic_attempt_question_idx ON topic_attempts(session_id, question_id);
CREATE INDEX IF NOT EXISTS topic_attempt_topic_idx ON topic_attempts(topic_id, at);
CREATE TABLE IF NOT EXISTS topic_errors (
  topic_id TEXT NOT NULL, tag TEXT NOT NULL, misses INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0, weight INTEGER NOT NULL DEFAULT 0,
  review_at INTEGER, last_miss_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS topic_error_tag_idx ON topic_errors(topic_id, tag);
