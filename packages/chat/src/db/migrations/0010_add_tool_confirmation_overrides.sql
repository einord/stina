-- Tool confirmation overrides
-- Allows users to override the default confirmation behavior per tool
CREATE TABLE IF NOT EXISTS tool_confirmation_overrides (
  user_id         TEXT NOT NULL,
  extension_id    TEXT NOT NULL,
  tool_id         TEXT NOT NULL,
  requires_confirmation INTEGER NOT NULL,  -- 0 = false, 1 = true
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (user_id, extension_id, tool_id)
);
CREATE INDEX IF NOT EXISTS idx_tool_conf_user
  ON tool_confirmation_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_tool_conf_user_ext
  ON tool_confirmation_overrides(user_id, extension_id);
