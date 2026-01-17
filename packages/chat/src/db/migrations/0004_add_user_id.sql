-- Add user_id column to conversations
ALTER TABLE chat_conversations ADD COLUMN user_id TEXT;

-- Add user_id column to model_configs
ALTER TABLE model_configs ADD COLUMN user_id TEXT;

-- Add user_id column to quick_commands
ALTER TABLE quick_commands ADD COLUMN user_id TEXT;

-- Add user_id column to app_settings
ALTER TABLE app_settings ADD COLUMN user_id TEXT;

-- Create indexes for user filtering
CREATE INDEX IF NOT EXISTS idx_conversations_user ON chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_active ON chat_conversations(user_id, active, created_at);
CREATE INDEX IF NOT EXISTS idx_model_configs_user ON model_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_quick_commands_user ON quick_commands(user_id);
CREATE INDEX IF NOT EXISTS idx_app_settings_user ON app_settings(user_id);
