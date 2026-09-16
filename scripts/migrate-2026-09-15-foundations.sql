-- Additive and repeatable; existing phrase and lesson-item history is preserved.
CREATE TABLE IF NOT EXISTS foundations_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS foundations_one_active
  ON foundations_sessions(status) WHERE status = 'active';
CREATE TABLE IF NOT EXISTS foundations_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  session_id TEXT NOT NULL REFERENCES foundations_sessions(id),
  question_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  rating INTEGER NOT NULL,
  independent INTEGER NOT NULL,
  exercise TEXT NOT NULL,
  answer TEXT NOT NULL,
  grade TEXT NOT NULL,
  revealed INTEGER NOT NULL DEFAULT 0,
  rated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS foundations_review_question
  ON foundations_reviews(session_id, question_id);
CREATE INDEX IF NOT EXISTS foundations_review_source
  ON foundations_reviews(source_key, independent, rated_at);
