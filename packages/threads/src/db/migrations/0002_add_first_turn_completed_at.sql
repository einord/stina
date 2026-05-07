BEGIN;

ALTER TABLE threads ADD COLUMN first_turn_completed_at INTEGER;

-- Backfill: treat all existing threads as already-handled. New threads will
-- start NULL and the orchestrator/applyFailureFraming set this after the
-- first decision turn completes (success or failure).
--
-- Why last_activity_at and not created_at: for any thread with message
-- activity, last_activity_at >= created_at and represents "something
-- happened" which is the closest pre-redesign equivalent of "first turn
-- done". For empty threads the two values are equal. If a user-DB contains a
-- thread that was created and never had a turn run, backfill marks it as
-- visible — accepted, since pre-existing visibility was the bug we're
-- fixing forward.
UPDATE threads SET first_turn_completed_at = last_activity_at
  WHERE first_turn_completed_at IS NULL;

-- Partial index: SQLite can use this for both the "IS NOT NULL" filter and
-- the ORDER BY last_activity_at DESC in one go.
CREATE INDEX IF NOT EXISTS idx_threads_first_turn_done
  ON threads (last_activity_at DESC) WHERE first_turn_completed_at IS NOT NULL;

COMMIT;
