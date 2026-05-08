BEGIN;
ALTER TABLE scheduler_jobs ADD COLUMN emit_json TEXT;
COMMIT;
