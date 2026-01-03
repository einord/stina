-- Create conversations table
CREATE TABLE IF NOT EXISTS chat_conversations (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_at INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  metadata TEXT
);

-- Create interactions table
CREATE TABLE IF NOT EXISTS chat_interactions (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  aborted INTEGER NOT NULL DEFAULT 0,
  messages TEXT NOT NULL,
  information_messages TEXT,
  metadata TEXT,
  FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
);

-- Create indexes for conversations
CREATE INDEX IF NOT EXISTS idx_conversations_active ON chat_conversations(active, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_created ON chat_conversations(created_at);

-- Create index for interactions
CREATE INDEX IF NOT EXISTS idx_interactions_conversation ON chat_interactions(conversation_id, created_at);
