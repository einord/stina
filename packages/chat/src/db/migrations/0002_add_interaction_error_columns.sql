-- Add error tracking columns for interactions
ALTER TABLE chat_interactions ADD COLUMN error INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chat_interactions ADD COLUMN error_message TEXT;
