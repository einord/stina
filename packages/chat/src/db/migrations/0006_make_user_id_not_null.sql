-- Migration: Make user_id NOT NULL in all relevant tables
-- This is a breaking change that cleans up old NULL data
--
-- SQLite doesn't support ALTER COLUMN, so we need to:
-- 1. Delete rows with NULL user_id
-- 2. Create new tables with NOT NULL constraint
-- 3. Copy data from old tables
-- 4. Drop old tables
-- 5. Rename new tables
-- 6. Recreate indexes

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- ============================================================
-- Step 1: Delete all rows with NULL user_id
-- ============================================================

-- Delete orphaned interactions first (where conversation has NULL user_id)
-- This should be handled by CASCADE, but let's be explicit
DELETE FROM chat_interactions
WHERE conversation_id IN (
  SELECT id FROM chat_conversations WHERE user_id IS NULL
);

-- Delete conversations with NULL user_id
DELETE FROM chat_conversations WHERE user_id IS NULL;

-- Delete model_configs with NULL user_id
DELETE FROM model_configs WHERE user_id IS NULL;

-- Delete user_settings with NULL user_id
DELETE FROM user_settings WHERE user_id IS NULL;

-- Delete quick_commands with NULL user_id
DELETE FROM quick_commands WHERE user_id IS NULL;

-- ============================================================
-- Step 2: Recreate chat_conversations with NOT NULL user_id
-- ============================================================

-- Create new table
CREATE TABLE chat_conversations_new (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_at INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  metadata TEXT,
  user_id TEXT NOT NULL
);

-- Copy data
INSERT INTO chat_conversations_new (id, title, created_at, active, metadata, user_id)
SELECT id, title, created_at, active, metadata, user_id
FROM chat_conversations;

-- Drop old table
DROP TABLE chat_conversations;

-- Rename new table
ALTER TABLE chat_conversations_new RENAME TO chat_conversations;

-- Recreate indexes
CREATE INDEX idx_conversations_active ON chat_conversations(active, created_at);
CREATE INDEX idx_conversations_created ON chat_conversations(created_at);
CREATE INDEX idx_conversations_user ON chat_conversations(user_id);
CREATE INDEX idx_conversations_user_active ON chat_conversations(user_id, active, created_at);

-- ============================================================
-- Step 3: Recreate chat_interactions (restore FK constraint)
-- Note: The foreign key was lost when we dropped chat_conversations
-- ============================================================

-- Create new table with foreign key
CREATE TABLE chat_interactions_new (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  aborted INTEGER NOT NULL DEFAULT 0,
  error INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  messages TEXT NOT NULL,
  information_messages TEXT,
  metadata TEXT
);

-- Copy data
INSERT INTO chat_interactions_new (id, conversation_id, created_at, aborted, error, error_message, messages, information_messages, metadata)
SELECT id, conversation_id, created_at, aborted, error, error_message, messages, information_messages, metadata
FROM chat_interactions;

-- Drop old table
DROP TABLE chat_interactions;

-- Rename new table
ALTER TABLE chat_interactions_new RENAME TO chat_interactions;

-- Recreate index
CREATE INDEX idx_interactions_conversation ON chat_interactions(conversation_id, created_at);

-- ============================================================
-- Step 4: Recreate model_configs with NOT NULL user_id
-- ============================================================

-- Create new table
CREATE TABLE model_configs_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  provider_extension_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  settings_override TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  user_id TEXT NOT NULL
);

-- Copy data
INSERT INTO model_configs_new (id, name, provider_id, provider_extension_id, model_id, is_default, settings_override, created_at, updated_at, user_id)
SELECT id, name, provider_id, provider_extension_id, model_id, is_default, settings_override, created_at, updated_at, user_id
FROM model_configs;

-- Drop old table
DROP TABLE model_configs;

-- Rename new table
ALTER TABLE model_configs_new RENAME TO model_configs;

-- Recreate indexes
CREATE INDEX idx_model_configs_default ON model_configs(is_default);
CREATE INDEX idx_model_configs_provider ON model_configs(provider_id);
CREATE INDEX idx_model_configs_user ON model_configs(user_id);

-- ============================================================
-- Step 5: Recreate user_settings with NOT NULL user_id
-- ============================================================

-- Create new table (note: composite primary key on key + user_id)
CREATE TABLE user_settings_new (
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (key, user_id)
);

-- Copy data
INSERT INTO user_settings_new (key, value, updated_at, user_id)
SELECT key, value, updated_at, user_id
FROM user_settings;

-- Drop old table
DROP TABLE user_settings;

-- Rename new table
ALTER TABLE user_settings_new RENAME TO user_settings;

-- Recreate indexes
CREATE INDEX idx_user_settings_key_user ON user_settings(key, user_id);
CREATE INDEX idx_user_settings_user ON user_settings(user_id);

-- ============================================================
-- Step 6: Recreate quick_commands with NOT NULL user_id
-- ============================================================

-- Create new table
CREATE TABLE quick_commands_new (
  id TEXT PRIMARY KEY,
  icon TEXT NOT NULL,
  command TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  user_id TEXT NOT NULL
);

-- Copy data
INSERT INTO quick_commands_new (id, icon, command, sort_order, created_at, updated_at, user_id)
SELECT id, icon, command, sort_order, created_at, updated_at, user_id
FROM quick_commands;

-- Drop old table
DROP TABLE quick_commands;

-- Rename new table
ALTER TABLE quick_commands_new RENAME TO quick_commands;

-- Recreate indexes
CREATE INDEX idx_quick_commands_sort ON quick_commands(sort_order);
CREATE INDEX idx_quick_commands_user ON quick_commands(user_id);
