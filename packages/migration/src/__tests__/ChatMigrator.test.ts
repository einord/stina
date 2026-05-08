import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { ChatMigrator } from '../ChatMigrator.js'

// ─── DDL helpers ─────────────────────────────────────────────────────────────

/**
 * Minimal legacy chat DDL (chat_conversations + chat_interactions) with user_id
 * as required in v0.x post-migration-0006.
 */
const LEGACY_CHAT_DDL = `
  CREATE TABLE IF NOT EXISTS chat_conversations (
    id TEXT PRIMARY KEY,
    title TEXT,
    created_at INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    metadata TEXT,
    user_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chat_interactions (
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
`

/**
 * Redesign-2026 threads + messages DDL (matches
 * packages/threads/src/db/migrations/0001_create_threads_tables.sql).
 */
const THREADS_DDL = `
  CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    trigger TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'quiet', 'archived')),
    surfaced_at INTEGER,
    notified_at INTEGER,
    title TEXT NOT NULL,
    summary TEXT,
    linked_entities TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    last_activity_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    author TEXT NOT NULL CHECK (author IN ('user', 'stina', 'app')),
    visibility TEXT NOT NULL CHECK (visibility IN ('normal', 'silent')) DEFAULT 'normal',
    source TEXT,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
  );
`

/** Create an in-memory DB seeded with both legacy and redesign DDL. */
function createDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(LEGACY_CHAT_DDL)
  db.exec(THREADS_DDL)
  return db
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000

/** Base timestamp for tests: 2024-03-15T10:00:00.000Z */
const BASE_TS = new Date('2024-03-15T10:00:00.000Z').getTime()

interface InteractionSeed {
  id: string
  conversationId: string
  createdAt: number
  messages: object[]
}

function seedConversation(
  db: Database.Database,
  userId: string,
  convId: string,
  createdAt: number = BASE_TS
): void {
  db.prepare(
    'INSERT INTO chat_conversations (id, created_at, user_id) VALUES (?, ?, ?)'
  ).run(convId, createdAt, userId)
}

function seedInteraction(
  db: Database.Database,
  seed: InteractionSeed
): void {
  db.prepare(
    `INSERT INTO chat_interactions
       (id, conversation_id, created_at, messages)
     VALUES (?, ?, ?, ?)`
  ).run(
    seed.id,
    seed.conversationId,
    seed.createdAt,
    JSON.stringify(seed.messages)
  )
}

function userMsg(text: string, ts: number = BASE_TS) {
  return {
    type: 'user',
    text,
    metadata: { createdAt: new Date(ts).toISOString() },
  }
}

function stinaMsg(text: string, ts: number = BASE_TS) {
  return {
    type: 'stina',
    text,
    metadata: { createdAt: new Date(ts).toISOString() },
  }
}

function countTable(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get() as { n: number }).n
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ChatMigrator', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createDb()
  })

  it('empty DB: 0 threads, 0 messages, all counts zero', () => {
    const stats = new ChatMigrator(db).migrate()
    expect(stats.legacyInteractionCount).toBe(0)
    expect(stats.migratedMessageCount).toBe(0)
    expect(stats.skippedMessageCount).toBe(0)
    expect(stats.threadCount).toBe(0)
    expect(countTable(db, 'threads')).toBe(0)
    expect(countTable(db, 'messages')).toBe(0)
  })

  it('single conversation with 3 interactions < 24h apart → 1 thread', () => {
    seedConversation(db, 'user1', 'conv1', BASE_TS)
    // Three interactions each 1 hour apart
    seedInteraction(db, {
      id: 'i1',
      conversationId: 'conv1',
      createdAt: BASE_TS,
      messages: [userMsg('Hello', BASE_TS), stinaMsg('Hi there', BASE_TS)],
    })
    seedInteraction(db, {
      id: 'i2',
      conversationId: 'conv1',
      createdAt: BASE_TS + 3600_000,
      messages: [userMsg('Follow up', BASE_TS + 3600_000)],
    })
    seedInteraction(db, {
      id: 'i3',
      conversationId: 'conv1',
      createdAt: BASE_TS + 7200_000,
      messages: [stinaMsg('Reply', BASE_TS + 7200_000)],
    })

    const stats = new ChatMigrator(db).migrate()
    expect(stats.threadCount).toBe(1)
    expect(stats.migratedMessageCount).toBe(4) // 2+1+1
    expect(stats.legacyInteractionCount).toBe(3)
    expect(countTable(db, 'threads')).toBe(1)
    expect(countTable(db, 'messages')).toBe(4)
  })

  it('3 interactions each 1+ day apart → 3 threads', () => {
    seedConversation(db, 'user1', 'conv1', BASE_TS)
    seedInteraction(db, {
      id: 'i1',
      conversationId: 'conv1',
      createdAt: BASE_TS,
      messages: [userMsg('Day 1', BASE_TS)],
    })
    seedInteraction(db, {
      id: 'i2',
      conversationId: 'conv1',
      createdAt: BASE_TS + DAY_MS,
      messages: [userMsg('Day 2', BASE_TS + DAY_MS)],
    })
    seedInteraction(db, {
      id: 'i3',
      conversationId: 'conv1',
      createdAt: BASE_TS + 2 * DAY_MS,
      messages: [userMsg('Day 3', BASE_TS + 2 * DAY_MS)],
    })

    const stats = new ChatMigrator(db).migrate()
    expect(stats.threadCount).toBe(3)
    expect(stats.migratedMessageCount).toBe(3)
  })

  describe('title rules', () => {
    it('uses first user message text when <= 60 chars', () => {
      seedConversation(db, 'u1', 'c1', BASE_TS)
      seedInteraction(db, {
        id: 'i1',
        conversationId: 'c1',
        createdAt: BASE_TS,
        messages: [userMsg('Short title', BASE_TS)],
      })
      new ChatMigrator(db).migrate()
      const thread = db.prepare('SELECT title FROM threads').get() as { title: string }
      expect(thread.title).toBe('Short title')
    })

    it('truncates title at exactly 60 codepoints when > 60 chars', () => {
      // 65 'a' characters
      const longText = 'a'.repeat(65)
      seedConversation(db, 'u1', 'c1', BASE_TS)
      seedInteraction(db, {
        id: 'i1',
        conversationId: 'c1',
        createdAt: BASE_TS,
        messages: [userMsg(longText, BASE_TS)],
      })
      new ChatMigrator(db).migrate()
      const thread = db.prepare('SELECT title FROM threads').get() as { title: string }
      expect([...thread.title].length).toBe(60)
      expect(thread.title).toBe('a'.repeat(60))
    })

    it('truncates multibyte codepoints (emoji) at exactly 60 codepoints', () => {
      // Use emoji (each is 2 UTF-16 code units but 1 codepoint)
      const emoji = '😀'
      const text = emoji.repeat(65)
      seedConversation(db, 'u1', 'c1', BASE_TS)
      seedInteraction(db, {
        id: 'i1',
        conversationId: 'c1',
        createdAt: BASE_TS,
        messages: [userMsg(text, BASE_TS)],
      })
      new ChatMigrator(db).migrate()
      const thread = db.prepare('SELECT title FROM threads').get() as { title: string }
      expect([...thread.title].length).toBe(60)
    })

    it('falls back to "Conversation from YYYY-MM-DD" when no user messages', () => {
      seedConversation(db, 'u1', 'c1', BASE_TS)
      seedInteraction(db, {
        id: 'i1',
        conversationId: 'c1',
        createdAt: BASE_TS,
        messages: [stinaMsg('Only stina', BASE_TS)],
      })
      new ChatMigrator(db).migrate()
      const thread = db.prepare('SELECT title FROM threads').get() as { title: string }
      // BASE_TS = 2024-03-15
      expect(thread.title).toBe('Conversation from 2024-03-15')
    })

    it('falls back when all user messages are empty/whitespace', () => {
      seedConversation(db, 'u1', 'c1', BASE_TS)
      seedInteraction(db, {
        id: 'i1',
        conversationId: 'c1',
        createdAt: BASE_TS,
        messages: [userMsg('   ', BASE_TS), stinaMsg('Reply', BASE_TS)],
      })
      new ChatMigrator(db).migrate()
      const thread = db.prepare('SELECT title FROM threads').get() as { title: string }
      expect(thread.title).toBe('Conversation from 2024-03-15')
    })
  })

  describe('message type filtering', () => {
    it('skips instruction, information, thinking, tools types; migrates user+stina', () => {
      seedConversation(db, 'u1', 'c1', BASE_TS)
      seedInteraction(db, {
        id: 'i1',
        conversationId: 'c1',
        createdAt: BASE_TS,
        messages: [
          userMsg('Hello', BASE_TS),
          stinaMsg('Hi', BASE_TS),
          { type: 'instruction', text: 'sys', metadata: { createdAt: new Date(BASE_TS).toISOString() } },
          { type: 'information', text: 'info', metadata: { createdAt: new Date(BASE_TS).toISOString() } },
          { type: 'thinking', text: 'think', done: true, metadata: { createdAt: new Date(BASE_TS).toISOString() } },
          { type: 'tools', tools: [], metadata: { createdAt: new Date(BASE_TS).toISOString() } },
        ],
      })

      const stats = new ChatMigrator(db).migrate()
      expect(stats.migratedMessageCount).toBe(2)
      expect(stats.skippedMessageCount).toBe(4)
    })
  })

  describe('multi-user isolation', () => {
    it("each user gets their own threads; users don't mix", () => {
      seedConversation(db, 'userA', 'convA', BASE_TS)
      seedInteraction(db, {
        id: 'ia1',
        conversationId: 'convA',
        createdAt: BASE_TS,
        messages: [userMsg('A message', BASE_TS)],
      })

      seedConversation(db, 'userB', 'convB', BASE_TS)
      seedInteraction(db, {
        id: 'ib1',
        conversationId: 'convB',
        createdAt: BASE_TS + 3600_000,
        messages: [userMsg('B message', BASE_TS + 3600_000)],
      })

      const stats = new ChatMigrator(db).migrate()
      // 2 threads because conversations are independent (even though < 24h apart)
      expect(stats.threadCount).toBe(2)
      expect(stats.migratedMessageCount).toBe(2)
    })
  })

  describe('multiple conversations per user', () => {
    it('each conversation is split independently (messages from convA and convB do not merge)', () => {
      // Two conversations for the same user within 1 hour of each other
      seedConversation(db, 'u1', 'convA', BASE_TS)
      seedConversation(db, 'u1', 'convB', BASE_TS + 1800_000)

      seedInteraction(db, {
        id: 'iA',
        conversationId: 'convA',
        createdAt: BASE_TS,
        messages: [userMsg('Conversation A', BASE_TS)],
      })
      seedInteraction(db, {
        id: 'iB',
        conversationId: 'convB',
        createdAt: BASE_TS + 1800_000,
        messages: [userMsg('Conversation B', BASE_TS + 1800_000)],
      })

      const stats = new ChatMigrator(db).migrate()
      // Even though < 24h, they are separate conversations → 2 threads
      expect(stats.threadCount).toBe(2)
      expect(stats.migratedMessageCount).toBe(2)
    })
  })

  describe('malformed JSON handling', () => {
    it('skips interactions with malformed JSON messages and continues migration', () => {
      seedConversation(db, 'u1', 'c1', BASE_TS)

      // Good interaction
      db.prepare(
        `INSERT INTO chat_interactions (id, conversation_id, created_at, messages)
         VALUES ('i1', 'c1', ?, ?)`
      ).run(BASE_TS, JSON.stringify([userMsg('Good message', BASE_TS)]))

      // Malformed JSON interaction (second, < 24h later)
      db.prepare(
        `INSERT INTO chat_interactions (id, conversation_id, created_at, messages)
         VALUES ('i2', 'c1', ?, ?)`
      ).run(BASE_TS + 3600_000, '{not valid json')

      // Another good interaction
      db.prepare(
        `INSERT INTO chat_interactions (id, conversation_id, created_at, messages)
         VALUES ('i3', 'c1', ?, ?)`
      ).run(BASE_TS + 7200_000, JSON.stringify([stinaMsg('Another good', BASE_TS + 7200_000)]))

      const stats = new ChatMigrator(db).migrate()
      // 1 thread (all in same segment — gaps < 24h)
      expect(stats.threadCount).toBe(1)
      // 2 migrated (from i1 and i3), 1 skipped (i2 — malformed)
      expect(stats.migratedMessageCount).toBe(2)
      expect(stats.skippedMessageCount).toBe(1)
      expect(stats.legacyInteractionCount).toBe(3)
    })

    it('skips interactions where messages field is not an array', () => {
      seedConversation(db, 'u1', 'c1', BASE_TS)
      db.prepare(
        `INSERT INTO chat_interactions (id, conversation_id, created_at, messages)
         VALUES ('i1', 'c1', ?, ?)`
      ).run(BASE_TS, JSON.stringify({ not: 'an array' }))

      const stats = new ChatMigrator(db).migrate()
      expect(stats.threadCount).toBe(1)
      expect(stats.migratedMessageCount).toBe(0)
      expect(stats.skippedMessageCount).toBe(1)
    })
  })

  describe('thread metadata', () => {
    it('all migrated threads have status archived and trigger kind user', () => {
      seedConversation(db, 'u1', 'c1', BASE_TS)
      seedInteraction(db, {
        id: 'i1',
        conversationId: 'c1',
        createdAt: BASE_TS,
        messages: [userMsg('Test', BASE_TS)],
      })

      new ChatMigrator(db).migrate()

      const thread = db.prepare('SELECT * FROM threads').get() as {
        status: string
        trigger: string
        surfaced_at: null
        notified_at: null
        linked_entities: string
      }
      expect(thread.status).toBe('archived')
      const trigger = JSON.parse(thread.trigger) as { kind: string }
      expect(trigger.kind).toBe('user')
      expect(thread.surfaced_at).toBeNull()
      expect(thread.notified_at).toBeNull()
      expect(JSON.parse(thread.linked_entities)).toEqual([])
    })

    it('created_at and last_activity_at match first/last interaction timestamps', () => {
      seedConversation(db, 'u1', 'c1', BASE_TS)
      const t1 = BASE_TS
      const t2 = BASE_TS + 3600_000
      const t3 = BASE_TS + 7200_000
      seedInteraction(db, { id: 'i1', conversationId: 'c1', createdAt: t1, messages: [userMsg('1', t1)] })
      seedInteraction(db, { id: 'i2', conversationId: 'c1', createdAt: t2, messages: [userMsg('2', t2)] })
      seedInteraction(db, { id: 'i3', conversationId: 'c1', createdAt: t3, messages: [userMsg('3', t3)] })

      new ChatMigrator(db).migrate()

      const thread = db.prepare('SELECT created_at, last_activity_at FROM threads').get() as {
        created_at: number
        last_activity_at: number
      }
      expect(thread.created_at).toBe(t1)
      expect(thread.last_activity_at).toBe(t3)
    })
  })
})
