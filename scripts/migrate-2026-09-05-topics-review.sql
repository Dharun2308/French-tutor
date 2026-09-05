ALTER TABLE topic_progress ADD COLUMN maintenance_due_at INTEGER;
UPDATE topic_progress SET maintenance_due_at = due_at
WHERE state IN ('85_PERCENT_REACHED', 'MAINTENANCE', 'AUTOMATIC');
