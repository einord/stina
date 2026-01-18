import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { ConversationRepository } from '../db/repository.js'
import { chatSchema } from '../db/schema.js'
import type { Conversation } from '../types/index.js'

/**
 * Creates an in-memory SQLite database with the chat schema for testing
 */
function createTestDb(): BetterSQLite3Database<typeof chatSchema> {
  const sqlite = new Database(':memory:')

  // Create tables
  sqlite.exec(`
    CREATE TABLE chat_conversations (
      id TEXT PRIMARY KEY,
      title TEXT,
      created_at INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      metadata TEXT,
      user_id TEXT NOT NULL
    );

    CREATE INDEX idx_conversations_active ON chat_conversations(active, created_at);
    CREATE INDEX idx_conversations_created ON chat_conversations(created_at);
    CREATE INDEX idx_conversations_user ON chat_conversations(user_id);
    CREATE INDEX idx_conversations_user_active ON chat_conversations(user_id, active, created_at);

    CREATE TABLE chat_interactions (
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

    CREATE INDEX idx_interactions_conversation ON chat_interactions(conversation_id, created_at);
  `)

  return drizzle(sqlite, { schema: chatSchema })
}

/**
 * Creates a test conversation object
 */
function createTestConversation(overrides: Partial<Conversation> = {}): Conversation {
  const id = overrides.id ?? `conv-${Math.random().toString(36).substr(2, 9)}`
  return {
    id,
    title: overrides.title ?? 'Test Conversation',
    active: overrides.active ?? true,
    interactions: overrides.interactions ?? [],
    metadata: overrides.metadata ?? { createdAt: new Date().toISOString() },
    userId: overrides.userId,
  }
}

describe('ConversationRepository - User Isolation', () => {
  let db: BetterSQLite3Database<typeof chatSchema>
  const USER_A = 'user-a-id'
  const USER_B = 'user-b-id'

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    // DB is in-memory so it gets cleaned up automatically
  })

  it('should only return conversations for the specified user', async () => {
    const repoA = new ConversationRepository(db, USER_A)
    const repoB = new ConversationRepository(db, USER_B)

    // User A creates a conversation
    const convA = createTestConversation({ id: 'conv-a', title: 'User A Conversation' })
    await repoA.saveConversation(convA)

    // User B creates a conversation
    const convB = createTestConversation({ id: 'conv-b', title: 'User B Conversation' })
    await repoB.saveConversation(convB)

    // User A should only see their own conversation
    const userAConversations = await repoA.listActiveConversations()
    expect(userAConversations).toHaveLength(1)
    expect(userAConversations[0]?.id).toBe('conv-a')
    expect(userAConversations[0]?.title).toBe('User A Conversation')

    // User B should only see their own conversation
    const userBConversations = await repoB.listActiveConversations()
    expect(userBConversations).toHaveLength(1)
    expect(userBConversations[0]?.id).toBe('conv-b')
    expect(userBConversations[0]?.title).toBe('User B Conversation')
  })

  it('should not return other users conversations', async () => {
    const repoA = new ConversationRepository(db, USER_A)
    const repoB = new ConversationRepository(db, USER_B)

    // User A creates multiple conversations
    await repoA.saveConversation(createTestConversation({ id: 'conv-a1', title: 'A1' }))
    await repoA.saveConversation(createTestConversation({ id: 'conv-a2', title: 'A2' }))
    await repoA.saveConversation(createTestConversation({ id: 'conv-a3', title: 'A3' }))

    // User B should see no conversations
    const userBConversations = await repoB.listActiveConversations()
    expect(userBConversations).toHaveLength(0)

    // User A should see all their conversations
    const userAConversations = await repoA.listActiveConversations()
    expect(userAConversations).toHaveLength(3)
  })

  it('should not allow accessing another users conversation by ID', async () => {
    const repoA = new ConversationRepository(db, USER_A)
    const repoB = new ConversationRepository(db, USER_B)

    // User A creates a conversation
    const convA = createTestConversation({ id: 'private-conv', title: 'Private' })
    await repoA.saveConversation(convA)

    // User A can access their own conversation
    const accessedByA = await repoA.getConversation('private-conv')
    expect(accessedByA).not.toBeNull()
    expect(accessedByA?.id).toBe('private-conv')

    // User B cannot access User A's conversation
    const accessedByB = await repoB.getConversation('private-conv')
    expect(accessedByB).toBeNull()
  })

  it('should not allow archiving another users conversation', async () => {
    const repoA = new ConversationRepository(db, USER_A)
    const repoB = new ConversationRepository(db, USER_B)

    // User A creates a conversation
    const convA = createTestConversation({ id: 'conv-to-archive', title: 'Archive Me' })
    await repoA.saveConversation(convA)

    // User B tries to archive User A's conversation
    await repoB.archiveConversation('conv-to-archive')

    // Verify the conversation is still active (User B's archive had no effect)
    const conversation = await repoA.getConversation('conv-to-archive')
    expect(conversation).not.toBeNull()
    expect(conversation?.active).toBe(true)
  })

  it('should create conversations with correct userId', async () => {
    const repoA = new ConversationRepository(db, USER_A)

    const conv = createTestConversation({ id: 'new-conv', title: 'New' })
    await repoA.saveConversation(conv)

    // Verify the conversation has the correct userId
    const saved = await repoA.getConversation('new-conv')
    expect(saved).not.toBeNull()
    expect(saved?.userId).toBe(USER_A)
  })

  it('should not allow updating another users conversation title', async () => {
    const repoA = new ConversationRepository(db, USER_A)
    const repoB = new ConversationRepository(db, USER_B)

    // User A creates a conversation
    const convA = createTestConversation({ id: 'conv-title', title: 'Original Title' })
    await repoA.saveConversation(convA)

    // User B tries to update the title
    await repoB.updateConversationTitle('conv-title', 'Hacked Title')

    // Verify the title is unchanged
    const conversation = await repoA.getConversation('conv-title')
    expect(conversation?.title).toBe('Original Title')
  })

  it('should not allow deleting another users conversation', async () => {
    const repoA = new ConversationRepository(db, USER_A)
    const repoB = new ConversationRepository(db, USER_B)

    // User A creates a conversation
    const convA = createTestConversation({ id: 'conv-delete', title: 'Do Not Delete' })
    await repoA.saveConversation(convA)

    // User B tries to delete User A's conversation
    await repoB.deleteConversation('conv-delete')

    // Verify the conversation still exists
    const conversation = await repoA.getConversation('conv-delete')
    expect(conversation).not.toBeNull()
    expect(conversation?.id).toBe('conv-delete')
  })

  it('should isolate getLatestActiveConversation by user', async () => {
    const repoA = new ConversationRepository(db, USER_A)
    const repoB = new ConversationRepository(db, USER_B)

    // User A creates a conversation
    const convA = createTestConversation({ id: 'latest-a', title: 'Latest A' })
    await repoA.saveConversation(convA)

    // User A can get their latest conversation
    const latestA = await repoA.getLatestActiveConversation()
    expect(latestA).not.toBeNull()
    expect(latestA?.id).toBe('latest-a')

    // User B has no conversations, so should get null
    const latestB = await repoB.getLatestActiveConversation()
    expect(latestB).toBeNull()
  })

  it('should not allow restoring another users conversation', async () => {
    const repoA = new ConversationRepository(db, USER_A)
    const repoB = new ConversationRepository(db, USER_B)

    // User A creates and archives a conversation
    const convA = createTestConversation({ id: 'conv-restore', title: 'Archived' })
    await repoA.saveConversation(convA)
    await repoA.archiveConversation('conv-restore')

    // Verify it's archived
    let conversation = await repoA.getConversation('conv-restore')
    expect(conversation?.active).toBe(false)

    // User B tries to restore User A's conversation
    await repoB.restoreConversation('conv-restore')

    // Verify the conversation is still archived
    conversation = await repoA.getConversation('conv-restore')
    expect(conversation?.active).toBe(false)
  })
})
