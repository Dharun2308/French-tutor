-- Phase 3: weak items, Active 10, Tutor Mode, recurring-error evidence.
-- Additive only. Apply with french-tutor.service stopped and a fresh DB backup.

ALTER TABLE item_reviews ADD COLUMN error_type text;
ALTER TABLE item_reviews ADD COLUMN corrected_answer text;
ALTER TABLE item_reviews ADD COLUMN grade_reason text;

CREATE TABLE active_selections (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  item_id integer NOT NULL,
  week_start integer NOT NULL,
  position integer NOT NULL,
  source text DEFAULT 'auto' NOT NULL,
  pinned integer DEFAULT false NOT NULL,
  score_snapshot real NOT NULL,
  reasons_json text DEFAULT '[]' NOT NULL,
  selected_at integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (item_id) REFERENCES learning_items(id) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX active_selections_item_week_idx
  ON active_selections (week_start, item_id);
CREATE UNIQUE INDEX active_selections_position_week_idx
  ON active_selections (week_start, position);
CREATE INDEX active_selections_week_idx
  ON active_selections (week_start, pinned, position);

CREATE TABLE tutor_usage_events (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  submission_id text NOT NULL,
  item_id integer NOT NULL,
  week_start integer NOT NULL,
  occurred_at integer DEFAULT (unixepoch() * 1000) NOT NULL,
  outcome text NOT NULL,
  FOREIGN KEY (item_id) REFERENCES learning_items(id) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX tutor_usage_submission_item_idx
  ON tutor_usage_events (submission_id, item_id);
CREATE INDEX tutor_usage_item_at_idx
  ON tutor_usage_events (item_id, occurred_at);

CREATE TABLE error_patterns (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  pattern_key text NOT NULL,
  error_type text NOT NULL,
  grammar_topic text DEFAULT '' NOT NULL,
  total_count integer DEFAULT 0 NOT NULL,
  first_seen_at integer NOT NULL,
  last_seen_at integer NOT NULL,
  last_item_id integer,
  FOREIGN KEY (last_item_id) REFERENCES learning_items(id) ON UPDATE no action ON DELETE set null
);
CREATE UNIQUE INDEX error_patterns_key_idx ON error_patterns (pattern_key);
CREATE INDEX error_patterns_last_seen_idx ON error_patterns (last_seen_at);
