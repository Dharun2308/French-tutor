-- Additive and repeatable. Existing learning history is untouched.
CREATE TABLE IF NOT EXISTS smart_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS smart_sessions_one_active
  ON smart_sessions(status) WHERE status = 'active';
