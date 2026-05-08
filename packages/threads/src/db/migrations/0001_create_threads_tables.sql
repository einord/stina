-- Create threads table.
-- See docs/redesign-2026/02-data-model.md §Thread.
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  -- ThreadTrigger as JSON; the discriminator is the `kind` field.
  trigger TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'quiet', 'archived')),
  -- surfaced_at: unix ms when Stina first addressed the user. NULL = background.
  surfaced_at INTEGER,
  -- notified_at: unix ms when a user-facing notification fired. May differ from surfaced_at.
  notified_at INTEGER,
  title TEXT NOT NULL,
  -- summary: updated by the dream pass when status=quiet
  summary TEXT,
  -- linked_entities as JSON array of EntityRef (with snapshot field per §02)
  linked_entities TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL
);

-- Indexes for the queries we'll actually run.
-- Active-thread listing in the inbox (most-recent-first).
CREATE INDEX IF NOT EXISTS idx_threads_status_last_activity
  ON threads (status, last_activity_at DESC);

-- Background-thread filter ("Silently handled" segment in §05).
CREATE INDEX IF NOT EXISTS idx_threads_surfaced_at
  ON threads (surfaced_at);

-- Trigger-kind filter chips (the `kind` field is at the top of the JSON,
-- so a partial index on json_extract is the cheap way to support filtering).
CREATE INDEX IF NOT EXISTS idx_threads_trigger_kind
  ON threads (json_extract(trigger, '$.kind'));

-- Create messages table.
-- See docs/redesign-2026/02-data-model.md §Message.
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  -- author: discriminator for the Message union ('user' | 'stina' | 'app')
  author TEXT NOT NULL CHECK (author IN ('user', 'stina', 'app')),
  visibility TEXT NOT NULL CHECK (visibility IN ('normal', 'silent')) DEFAULT 'normal',
  -- For app-authored messages, this is { extension_id, component? } JSON.
  -- For user/stina messages, NULL.
  source TEXT,
  -- Content as JSON. Shape depends on author:
  --   user: { text, attachments? }
  --   stina: { text?, tool_calls?, tool_results? }
  --   app: AppContent (typed by `kind` discriminator)
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
);

-- Index for thread detail rendering (chronological order within a thread).
CREATE INDEX IF NOT EXISTS idx_messages_thread_created
  ON messages (thread_id, created_at);

-- Index for visibility-filtered queries (inline activity rendering excludes
-- silent messages by default in some surfaces).
CREATE INDEX IF NOT EXISTS idx_messages_thread_visibility
  ON messages (thread_id, visibility, created_at);
