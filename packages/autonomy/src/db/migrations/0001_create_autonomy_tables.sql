-- Create auto_policies table.
-- See docs/redesign-2026/02-data-model.md §Auto-policy and §06.
CREATE TABLE IF NOT EXISTS auto_policies (
  id TEXT PRIMARY KEY,
  -- Tool the policy authorizes auto-execution of (extension manifest tool id).
  tool_id TEXT NOT NULL,
  -- PolicyScope as JSON: { standing_instruction_id?, match?, trigger_kinds? }
  scope TEXT NOT NULL,
  -- mode is always 'inform' in v1; reserved for future extensions.
  mode TEXT NOT NULL CHECK (mode IN ('inform')) DEFAULT 'inform',
  created_at INTEGER NOT NULL,
  source_thread_id TEXT,
  approval_count INTEGER NOT NULL DEFAULT 0,
  -- Records whether this policy came from a Stina suggestion or
  -- user-initiated creation (per §06 policy-creation flow).
  created_by_suggestion INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (source_thread_id) REFERENCES threads(id) ON DELETE SET NULL
);

-- Approval-gate lookup by tool_id (the hottest query — runs on every tool call).
CREATE INDEX IF NOT EXISTS idx_auto_policies_tool
  ON auto_policies (tool_id);

-- Cascade lookup when a standing instruction expires (per §06).
CREATE INDEX IF NOT EXISTS idx_auto_policies_instruction
  ON auto_policies (json_extract(scope, '$.standing_instruction_id'));

-- Create activity_log_entries table.
-- See docs/redesign-2026/02-data-model.md §Activity log entry.
CREATE TABLE IF NOT EXISTS activity_log_entries (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN (
    'event_handled',
    'event_silenced',
    'auto_action',
    'action_blocked',
    'memory_change',
    'thread_created',
    'dream_pass_run',
    'dream_pass_flag',
    'settings_migration',
    'migration_completed'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'low',
  thread_id TEXT,
  summary TEXT NOT NULL,
  -- Structured details for the inspector. Shape depends on `kind`.
  details TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  -- Default 365 days; user-configurable downward in settings.
  retention_days INTEGER NOT NULL DEFAULT 365,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
);

-- Inline rendering: entries with thread_id at created_at position.
CREATE INDEX IF NOT EXISTS idx_activity_log_thread_created
  ON activity_log_entries (thread_id, created_at);

-- Activity log inspector filter row (kind + date range).
CREATE INDEX IF NOT EXISTS idx_activity_log_kind_created
  ON activity_log_entries (kind, created_at DESC);

-- Recap composition: by-time descending across kinds, with kind filter.
CREATE INDEX IF NOT EXISTS idx_activity_log_created
  ON activity_log_entries (created_at DESC);

-- Daily retention cleanup runs against this index (created_at + retention_days vs. now).
-- A simple created_at index suffices; the cleanup query is a full scan with WHERE.
