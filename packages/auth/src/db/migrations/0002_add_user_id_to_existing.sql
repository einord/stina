-- Add user_id column to app_settings
-- Note: Other tables (chat_conversations, model_configs, quick_commands) 
-- are handled by chat package migration 0004_add_user_id.sql
ALTER TABLE app_settings ADD COLUMN user_id TEXT REFERENCES users(id);

-- Create index for user filtering on app_settings
CREATE INDEX IF NOT EXISTS idx_app_settings_user ON app_settings(user_id);
