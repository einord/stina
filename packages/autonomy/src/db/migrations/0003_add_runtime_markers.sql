BEGIN;

-- Generic "did the runtime do this once?" marker table. Keyed by
-- (marker_key, user_id) so future per-user markers reuse the same primitive
-- without a schema change.
--
-- First consumer: 'welcome_thread_v1' — tracks whether the first-boot welcome
-- thread has been spawned for a given user. Future consumers (notification
-- opt-in suggestion, seed-data warning, etc.) add rows here without a new
-- migration. To bump copy for existing users, use a new key suffix (_v2, etc.).
--
-- Design notes:
-- - value is optional opaque metadata (NULL for boolean markers).
-- - set_at is Unix ms (matches the pattern used in tool_severity_snapshots).
-- - PRIMARY KEY (marker_key, user_id): each (key, user) pair has exactly one
--   row; upserts replace on conflict.
CREATE TABLE IF NOT EXISTS runtime_markers (
  marker_key TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  value      TEXT,
  set_at     INTEGER NOT NULL,
  PRIMARY KEY (marker_key, user_id)
);

COMMIT;
