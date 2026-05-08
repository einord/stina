BEGIN;

-- Persistent snapshot of the last-seen severity for each (extension, tool)
-- pair. Used by the severity-change cascade handler in @stina/orchestrator to
-- detect when an extension update changes a tool's declared severity across
-- process restarts.
--
-- Design notes:
-- - The snapshot stores the RESOLVED severity (undefined → 'medium'), matching
--   the producer's `?? 'medium'` gate semantics. Callers pre-resolve before
--   comparing.
-- - READ (compare) and WRITE (recordSeen) are intentionally separate
--   operations. The snapshot is updated AFTER a successful cascade, not before.
--   If the process crashes between cascade and recordSeen, the next boot
--   re-runs the cascade (at-least-once semantics). Better than silent
--   permanent loss from snapshot-update-before-cascade.
-- - PRIMARY KEY (extension_id, tool_id): each tool has exactly one snapshot
--   row; upserts replace the row on re-observation.
CREATE TABLE IF NOT EXISTS tool_severity_snapshots (
  extension_id TEXT NOT NULL,
  tool_id      TEXT NOT NULL,
  severity     TEXT NOT NULL,          -- 'low' | 'medium' | 'high' | 'critical'
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (extension_id, tool_id)
);

COMMIT;
