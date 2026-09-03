-- Phase 2 migration (hand-applied 2026-09-02). drizzle-kit push wanted to rebuild learning_items
-- because it mis-reads default(0)/default(false) as 'no default'. Everything here is additive.
BEGIN;
ALTER TABLE settings ADD COLUMN extract_providers text NOT NULL DEFAULT '{"codex":true,"claude":true,"openai":false}';
ALTER TABLE import_batches ADD COLUMN note text;
ALTER TABLE import_batches ADD COLUMN provider_log text NOT NULL DEFAULT '[]';
ALTER TABLE import_batches ADD COLUMN extract_error text;
ALTER TABLE learning_items ADD COLUMN fsrs_state integer NOT NULL DEFAULT 0;
ALTER TABLE learning_items ADD COLUMN stability real NOT NULL DEFAULT 0;
ALTER TABLE learning_items ADD COLUMN difficulty real NOT NULL DEFAULT 0;
ALTER TABLE learning_items ADD COLUMN elapsed_days integer NOT NULL DEFAULT 0;
ALTER TABLE learning_items ADD COLUMN scheduled_days integer NOT NULL DEFAULT 0;
ALTER TABLE learning_items ADD COLUMN learning_steps integer NOT NULL DEFAULT 0;
ALTER TABLE learning_items ADD COLUMN reps integer NOT NULL DEFAULT 0;
ALTER TABLE learning_items ADD COLUMN lapses integer NOT NULL DEFAULT 0;
ALTER TABLE learning_items ADD COLUMN due_at integer NOT NULL DEFAULT 0;
ALTER TABLE learning_items ADD COLUMN last_reviewed_at integer;
ALTER TABLE learning_items ADD COLUMN review_count integer NOT NULL DEFAULT 0;
ALTER TABLE learning_items ADD COLUMN success_count integer NOT NULL DEFAULT 0;
ALTER TABLE learning_items ADD COLUMN failure_count integer NOT NULL DEFAULT 0;
ALTER TABLE learning_items ADD COLUMN last_failure_at integer;
ALTER TABLE learning_items ADD COLUMN spontaneous_usage_count integer NOT NULL DEFAULT 0;
ALTER TABLE learning_items ADD COLUMN production_seen integer NOT NULL DEFAULT 0;
ALTER TABLE learning_items ADD COLUMN production_correct integer NOT NULL DEFAULT 0;
ALTER TABLE learning_items ADD COLUMN recognition_seen integer NOT NULL DEFAULT 0;
ALTER TABLE learning_items ADD COLUMN recognition_correct integer NOT NULL DEFAULT 0;
ALTER TABLE learning_items ADD COLUMN listening_seen integer NOT NULL DEFAULT 0;
ALTER TABLE learning_items ADD COLUMN listening_correct integer NOT NULL DEFAULT 0;
ALTER TABLE learning_items ADD COLUMN suspended integer NOT NULL DEFAULT 0;
CREATE INDEX `learning_items_due_idx` ON `learning_items` (`due_at`,`suspended`);
CREATE TABLE `item_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`rated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`rating` integer NOT NULL,
	`direction` text DEFAULT 'production' NOT NULL,
	`verdict` text,
	`user_answer` text,
	`elapsed_ms` integer,
	`graded_by` text,
	`stability_after` real,
	`difficulty_after` real,
	`scheduled_days` integer,
	FOREIGN KEY (`item_id`) REFERENCES `learning_items`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX `item_reviews_item_idx` ON `item_reviews` (`item_id`,`rated_at`);
CREATE INDEX `item_reviews_rated_idx` ON `item_reviews` (`rated_at`);
CREATE TABLE `provider_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`purpose` text NOT NULL,
	`provider` text NOT NULL,
	`ok` integer NOT NULL,
	`ms` integer NOT NULL,
	`model` text,
	`error` text,
	`batch_id` integer
);
CREATE INDEX `provider_events_provider_idx` ON `provider_events` (`provider`,`at`);
COMMIT;
