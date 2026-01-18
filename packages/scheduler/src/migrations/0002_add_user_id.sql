-- Add user_id column to scheduler_jobs for user-scoped scheduled jobs
-- This allows extensions to schedule jobs that are associated with specific users

ALTER TABLE scheduler_jobs ADD COLUMN user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_scheduler_jobs_user_id ON scheduler_jobs(user_id);
