-- Migration: Make model_configs global and move default model choice to user_settings
--
-- Changes:
-- 1. Remove user_id column from model_configs (configs are now global, managed by admins)
-- 2. Remove is_default column from model_configs (default is now per-user in user_settings)
-- 3. User's default model will be stored as a regular key in user_settings table
--
-- SQLite doesn't support ALTER COLUMN or DROP COLUMN, so we need to:
-- 1. Create a new table without user_id and is_default
-- 2. Copy data (deduplicate by keeping one of each model config)
-- 3. Drop old table
-- 4. Rename new table
-- 5. Recreate indexes

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- ============================================================
-- Step 1: Create new model_configs table without user_id and is_default
-- ============================================================

CREATE TABLE model_configs_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  provider_extension_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  settings_override TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- ============================================================
-- Step 2: Copy data, keeping unique configs
-- Since we're removing user_id, we might have duplicates
-- We'll keep the first (oldest by created_at) of each unique model
-- ============================================================

INSERT INTO model_configs_new (id, name, provider_id, provider_extension_id, model_id, settings_override, created_at, updated_at)
SELECT id, name, provider_id, provider_extension_id, model_id, settings_override, created_at, updated_at
FROM model_configs
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY provider_id, model_id
      ORDER BY created_at ASC
    ) as rn
    FROM model_configs
  ) WHERE rn = 1
);

-- ============================================================
-- Step 3: Drop old table
-- ============================================================

DROP TABLE model_configs;

-- ============================================================
-- Step 4: Rename new table
-- ============================================================

ALTER TABLE model_configs_new RENAME TO model_configs;

-- ============================================================
-- Step 5: Recreate indexes (without user_id and is_default indexes)
-- ============================================================

CREATE INDEX idx_model_configs_provider ON model_configs(provider_id);

-- Note: User's default model is now stored in user_settings as key 'defaultModelConfigId'
-- Example: INSERT INTO user_settings (key, value, updated_at, user_id)
--          VALUES ('defaultModelConfigId', '"model-config-id-here"', strftime('%s', 'now'), 'user-id')
