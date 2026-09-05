ALTER TABLE topic_progress ADD COLUMN needs_theory INTEGER NOT NULL DEFAULT 0;
ALTER TABLE topic_progress ADD COLUMN last_studied_at INTEGER;
