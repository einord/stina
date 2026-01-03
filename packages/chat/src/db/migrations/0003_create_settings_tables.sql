-- App settings table (key-value storage)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Quick commands table
CREATE TABLE IF NOT EXISTS quick_commands (
  id TEXT PRIMARY KEY,
  icon TEXT NOT NULL,
  command TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Index for quick commands sort order
CREATE INDEX IF NOT EXISTS idx_quick_commands_sort ON quick_commands(sort_order);
