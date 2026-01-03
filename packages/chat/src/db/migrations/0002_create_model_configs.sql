-- Create model_configs table for user-configured AI models
CREATE TABLE IF NOT EXISTS model_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  provider_extension_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  settings_override TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Create indexes for model_configs
CREATE INDEX IF NOT EXISTS idx_model_configs_default ON model_configs(is_default);
CREATE INDEX IF NOT EXISTS idx_model_configs_provider ON model_configs(provider_id);
