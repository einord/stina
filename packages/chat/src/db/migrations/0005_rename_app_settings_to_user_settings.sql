-- Rename app_settings table to user_settings for multi-user support
-- The user_id column was already added in migration 0004

-- Rename the table
ALTER TABLE app_settings RENAME TO user_settings;

-- Update the index name (SQLite doesn't support renaming indexes, so we drop and recreate)
DROP INDEX IF EXISTS idx_app_settings_user;
CREATE INDEX IF NOT EXISTS idx_user_settings_user ON user_settings(user_id);

-- Add a composite unique constraint for key + user_id
-- This ensures each user can have their own settings with the same keys
-- Note: We need to recreate the table to change the primary key structure
-- For now, we'll add a unique index instead since SQLite has limitations

-- Create unique index on (key, user_id) - allows same key for different users
-- user_id can be NULL for backward compatibility during migration
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_settings_key_user ON user_settings(key, user_id);
