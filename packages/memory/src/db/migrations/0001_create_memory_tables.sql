-- Create standing_instructions table.
-- See docs/redesign-2026/02-data-model.md §Standing instruction.
CREATE TABLE IF NOT EXISTS standing_instructions (
  id TEXT PRIMARY KEY,
  rule TEXT NOT NULL,
  -- InstructionScope as JSON: { channels?, match? }
  scope TEXT NOT NULL,
  valid_from INTEGER NOT NULL,
  -- valid_until: null = indefinite
  valid_until INTEGER,
  -- InvalidationCondition[] as JSON
  invalidate_on TEXT NOT NULL DEFAULT '[]',
  source_thread_id TEXT,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL CHECK (created_by IN ('user', 'stina')),
  FOREIGN KEY (source_thread_id) REFERENCES threads(id) ON DELETE SET NULL
);

-- Active-instruction lookup at thread-start (per §03 thread-start context loader).
-- Filters on valid_from/valid_until at runtime; the index covers the by-time scan.
CREATE INDEX IF NOT EXISTS idx_standing_instructions_validity
  ON standing_instructions (valid_from, valid_until);

-- Provenance filter (Inställningar → Minne → "by source").
CREATE INDEX IF NOT EXISTS idx_standing_instructions_created_by
  ON standing_instructions (created_by, created_at DESC);

-- Create profile_facts table.
-- See docs/redesign-2026/02-data-model.md §Profile fact.
CREATE TABLE IF NOT EXISTS profile_facts (
  id TEXT PRIMARY KEY,
  fact TEXT NOT NULL,
  subject TEXT NOT NULL,
  -- Free-text predicate in v1 (controlled vocabulary deferred per §03).
  predicate TEXT NOT NULL,
  source_thread_id TEXT,
  last_referenced_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL CHECK (created_by IN ('user', 'stina')),
  FOREIGN KEY (source_thread_id) REFERENCES threads(id) ON DELETE SET NULL
);

-- Subject+predicate lookup for thread-start entity matching and contradiction detection.
CREATE INDEX IF NOT EXISTS idx_profile_facts_subject_predicate
  ON profile_facts (subject, predicate);

-- Stale-fact detection in dream pass (per §07 task 7).
CREATE INDEX IF NOT EXISTS idx_profile_facts_last_referenced
  ON profile_facts (last_referenced_at);

-- Create thread_summaries table.
-- See docs/redesign-2026/02-data-model.md §Thread summary.
CREATE TABLE IF NOT EXISTS thread_summaries (
  thread_id TEXT PRIMARY KEY,
  summary TEXT NOT NULL,
  -- topics as JSON array of strings (cheap filtering)
  topics TEXT NOT NULL DEFAULT '[]',
  generated_at INTEGER NOT NULL,
  -- Used by the dream pass to detect stale summaries (re-summarize when
  -- > 5 user-meaningful new messages or > 50% growth).
  message_count_at_generation INTEGER NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
);

-- Recap composition pulls recently-generated summaries for context.
CREATE INDEX IF NOT EXISTS idx_thread_summaries_generated
  ON thread_summaries (generated_at DESC);
