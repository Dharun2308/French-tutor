PRAGMA foreign_keys = ON;

BEGIN;
ALTER TABLE item_reviews ADD COLUMN request_id TEXT;
CREATE UNIQUE INDEX item_reviews_request_idx
  ON item_reviews (item_id, request_id);
COMMIT;
