PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS item_variations (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  item_id INTEGER NOT NULL REFERENCES learning_items(id) ON DELETE CASCADE,
  prompt_en TEXT NOT NULL,
  target_fr TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS item_variations_item_idx ON item_variations(item_id, created_at);

CREATE TABLE IF NOT EXISTS conversation_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  started_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  ended_at INTEGER,
  scenario TEXT NOT NULL,
  target_item_ids TEXT NOT NULL DEFAULT '[]',
  used_item_ids TEXT NOT NULL DEFAULT '[]',
  transcript TEXT NOT NULL DEFAULT '[]',
  provider TEXT,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'active'
);

