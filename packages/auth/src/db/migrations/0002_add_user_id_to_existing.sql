-- Add user_id column to app_settings
ALTER TABLE app_settings ADD COLUMN user_id TEXT REFERENCES users(id);

-- Create index for user filtering on app_settings
CREATE INDEX IF NOT EXISTS idx_app_settings_user ON app_settings(user_id);

-- Note: chat_conversations, model_configs, and quick_commands tables have user_id columns
-- added by chat package migration 0004_add_user_id.sql (which runs before this migration).
-- Ideally these would have FK constraints to users(id), but SQLite doesn't support
-- adding FK constraints to existing columns. The columns exist but without FK enforcement.
-- This is acceptable for the application's use case.
