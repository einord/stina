import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runMigrationIfNeeded } from '../runMigrationIfNeeded.js'
import { MigrationInterruptedError } from '../MigrationInterruptedError.js'
import { ensureSchemaVersionsTable, hasSchemaVersion, recordSchemaVersion } from '../schemaVersions.js'

// ─── DDL helpers ─────────────────────────────────────────────────────────────

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

// ─── Setup / teardown ────────────────────────────────────────────────────────

let tmpDir: string
let backupDir: string
let markerPath: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-migration-test-'))
  backupDir = path.join(tmpDir, 'backups')
  markerPath = path.join(tmpDir, 'migration-in-progress')
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ─── Real on-disk DB helpers ──────────────────────────────────────────────────

/**
 * Creates a real on-disk DB required for VACUUM INTO (doesn't work with :memory:).
 */
function createRealDb(filename: string): Database.Database {
  const dbPath = path.join(tmpDir, filename)
  const db = new Database(dbPath)
  db.exec(LEGACY_CHAT_DDL)
  db.exec(THREADS_DDL)
  return db
}

const BASE_TS = new Date('2024-03-15T10:00:00.000Z').getTime()

function seedLegacyData(db: Database.Database): void {
  db.prepare(
    'INSERT INTO chat_conversations (id, created_at, user_id) VALUES (?, ?, ?)'
  ).run('conv1', BASE_TS, 'user1')
  db.prepare(
    `INSERT INTO chat_interactions (id, conversation_id, created_at, messages)
     VALUES (?, ?, ?, ?)`
  ).run(
    'inter1',
    'conv1',
    BASE_TS,
    JSON.stringify([
      { type: 'user', text: 'Hello', metadata: { createdAt: new Date(BASE_TS).toISOString() } },
      { type: 'stina', text: 'Hi there!', metadata: { createdAt: new Date(BASE_TS + 1000).toISOString() } },
    ])
  )
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('runMigrationIfNeeded', () => {
  describe('already migrated', () => {
    it('skips silently when chat@1.0.0 already in schema_versions', () => {
      const db = createRealDb('already-migrated.db')
      seedLegacyData(db)

      // Pre-record the schema version so it looks already migrated.
      ensureSchemaVersionsTable(db)
      recordSchemaVersion(db, 'chat', '1.0.0')

      runMigrationIfNeeded(db, { backupDir, markerPath, sourceVersion: 'v0.5.0' })

      // No backup file should have been written.
      expect(fs.existsSync(backupDir)).toBe(false)

      // No error, marker never created.
      expect(fs.existsSync(markerPath)).toBe(false)

      db.close()
    })
  })

  describe('interrupted marker', () => {
    it('throws MigrationInterruptedError when marker file exists', () => {
      const db = createRealDb('interrupted.db')

      // Write a stale marker to simulate a crashed previous run.
      fs.writeFileSync(markerPath, JSON.stringify({ phase: 'package:chat' }), 'utf-8')

      expect(() =>
        runMigrationIfNeeded(db, { backupDir, markerPath, sourceVersion: 'v0.5.0' })
      ).toThrow(MigrationInterruptedError)

      db.close()
    })

    it('MigrationInterruptedError has correct markerPath', () => {
      const db = createRealDb('interrupted2.db')
      fs.writeFileSync(markerPath, '{}', 'utf-8')

      let caught: MigrationInterruptedError | null = null
      try {
        runMigrationIfNeeded(db, { backupDir, markerPath, sourceVersion: 'v0.5.0' })
      } catch (err) {
        if (err instanceof MigrationInterruptedError) caught = err
      }

      expect(caught).not.toBeNull()
      expect(caught!.markerPath).toBe(markerPath)

      db.close()
    })
  })

  describe('fresh DB with legacy data', () => {
    it('writes backup, migrates threads, records schema_versions, removes marker', () => {
      const db = createRealDb('fresh-with-data.db')
      seedLegacyData(db)

      runMigrationIfNeeded(db, { backupDir, markerPath, sourceVersion: 'v0.36.0' })

      // Backup file should have been created.
      const backupFiles = fs.readdirSync(backupDir)
      expect(backupFiles.length).toBe(1)
      expect(backupFiles[0]).toMatch(/^pre-redesign-2026-from-v0\.36\.0-\d+\.stina-backup$/)

      // Threads should have been created.
      const threadCount = (db.prepare('SELECT COUNT(*) as n FROM threads').get() as { n: number }).n
      expect(threadCount).toBeGreaterThan(0)

      // Schema version should be recorded.
      expect(hasSchemaVersion(db, 'chat', '1.0.0')).toBe(true)

      // Marker should be removed after clean migration.
      expect(fs.existsSync(markerPath)).toBe(false)

      db.close()
    })
  })

  describe('fresh DB with no chat_conversations table', () => {
    it('records chat@1.0.0 without touching backup dir', () => {
      // DB without legacy schema — no LEGACY_CHAT_DDL.
      const dbPath = path.join(tmpDir, 'no-legacy.db')
      const db = new Database(dbPath)
      db.exec(THREADS_DDL)

      runMigrationIfNeeded(db, { backupDir, markerPath, sourceVersion: 'v0.5.0' })

      // No backup.
      expect(fs.existsSync(backupDir)).toBe(false)

      // Schema version recorded.
      expect(hasSchemaVersion(db, 'chat', '1.0.0')).toBe(true)

      // No marker.
      expect(fs.existsSync(markerPath)).toBe(false)

      db.close()
    })
  })

  describe('fresh DB with chat_conversations table but 0 rows', () => {
    it('records chat@1.0.0 without writing backup for empty table', () => {
      const db = createRealDb('empty-conversations.db')
      // Table exists but no rows seeded.

      runMigrationIfNeeded(db, { backupDir, markerPath, sourceVersion: 'v0.5.0' })

      // No backup.
      expect(fs.existsSync(backupDir)).toBe(false)

      // Schema version recorded.
      expect(hasSchemaVersion(db, 'chat', '1.0.0')).toBe(true)

      // No marker.
      expect(fs.existsSync(markerPath)).toBe(false)

      db.close()
    })
  })

  describe('idempotency', () => {
    it('calling twice on already-migrated DB does not write a second backup', () => {
      const db = createRealDb('idempotent.db')
      seedLegacyData(db)

      // First call: migrates.
      runMigrationIfNeeded(db, { backupDir, markerPath, sourceVersion: 'v0.5.0' })
      const filesAfterFirst = fs.readdirSync(backupDir)
      expect(filesAfterFirst.length).toBe(1)

      // Second call: should be a no-op.
      runMigrationIfNeeded(db, { backupDir, markerPath, sourceVersion: 'v0.5.0' })
      const filesAfterSecond = fs.readdirSync(backupDir)
      expect(filesAfterSecond.length).toBe(1)

      db.close()
    })
  })
})
