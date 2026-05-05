import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { checkFkIntegrity, checkAllArchived, runSanityChecks } from '../sanityChecks.js'
import type { ChatMigratorStats } from '../ChatMigrator.js'

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

function createDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(THREADS_DDL)
  return db
}

function insertThread(db: Database.Database, id: string, status = 'archived'): void {
  db.prepare(
    `INSERT INTO threads (id, trigger, status, title, linked_entities, created_at, last_activity_at)
     VALUES (?, '{"kind":"user"}', ?, 'Test', '[]', 1000, 1000)`
  ).run(id, status)
}

function insertMessage(db: Database.Database, id: string, threadId: string): void {
  db.exec('PRAGMA foreign_keys = OFF')
  db.prepare(
    `INSERT INTO messages (id, thread_id, author, visibility, content, created_at)
     VALUES (?, ?, 'user', 'normal', '{"text":"hi"}', 1000)`
  ).run(id, threadId)
  db.exec('PRAGMA foreign_keys = ON')
}

describe('checkFkIntegrity', () => {
  it('passes on empty tables', () => {
    const db = createDb()
    expect(() => checkFkIntegrity(db)).not.toThrow()
  })

  it('passes when all messages have valid thread references', () => {
    const db = createDb()
    insertThread(db, 'thread-1')
    db.exec('PRAGMA foreign_keys = OFF')
    db.prepare(
      `INSERT INTO messages (id, thread_id, author, visibility, content, created_at)
       VALUES ('msg-1', 'thread-1', 'user', 'normal', '{"text":"hi"}', 1000)`
    ).run()
    db.exec('PRAGMA foreign_keys = ON')
    expect(() => checkFkIntegrity(db)).not.toThrow()
  })

  it('throws when a message has a dangling thread_id', () => {
    const db = createDb()
    // Insert message with non-existent thread_id (FK enforcement OFF at insert time)
    insertMessage(db, 'msg-orphan', 'nonexistent-thread')
    expect(() => checkFkIntegrity(db)).toThrow(/FK integrity/)
  })

  it('throws with count of dangling rows in error message', () => {
    const db = createDb()
    insertMessage(db, 'msg-a', 'bad-thread-1')
    insertMessage(db, 'msg-b', 'bad-thread-2')
    let thrown = ''
    try {
      checkFkIntegrity(db)
    } catch (e) {
      thrown = (e as Error).message
    }
    expect(thrown).toContain('2 message(s)')
  })
})

describe('checkAllArchived', () => {
  it('passes on empty threads table', () => {
    const db = createDb()
    expect(() => checkAllArchived(db)).not.toThrow()
  })

  it('passes when all threads are archived', () => {
    const db = createDb()
    insertThread(db, 'thread-1', 'archived')
    insertThread(db, 'thread-2', 'archived')
    expect(() => checkAllArchived(db)).not.toThrow()
  })

  it('throws when a thread has status != archived', () => {
    const db = createDb()
    insertThread(db, 'thread-1', 'archived')
    db.prepare(
      `INSERT INTO threads (id, trigger, status, title, linked_entities, created_at, last_activity_at)
       VALUES ('thread-active', '{"kind":"user"}', 'active', 'Active', '[]', 1000, 1000)`
    ).run()
    expect(() => checkAllArchived(db)).toThrow(/all-archived/)
  })
})

describe('runSanityChecks', () => {
  it('passes all checks on a clean migrated state', () => {
    const db = createDb()
    insertThread(db, 'thread-1')
    db.exec('PRAGMA foreign_keys = OFF')
    db.prepare(
      `INSERT INTO messages (id, thread_id, author, visibility, content, created_at)
       VALUES ('msg-1', 'thread-1', 'user', 'normal', '{"text":"hi"}', 1000)`
    ).run()
    db.exec('PRAGMA foreign_keys = ON')
    const stats: ChatMigratorStats = {
      legacyInteractionCount: 1,
      migratedMessageCount: 1,
      skippedMessageCount: 0,
      threadCount: 1,
    }
    expect(() => runSanityChecks(db, stats)).not.toThrow()
  })
})
