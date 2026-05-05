import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BackupWriter } from '../BackupWriter.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-writer-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

/**
 * Creates a real on-disk SQLite database with a simple table so we can verify
 * the backup is readable and contains the expected schema.
 * VACUUM INTO does not work with :memory: as the source.
 */
function createRealDb(dbPath: string): Database.Database {
  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE IF NOT EXISTS test_data (
      id TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)
  db.prepare('INSERT INTO test_data (id, value) VALUES (?, ?)').run('row1', 'hello')
  return db
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BackupWriter', () => {
  it('happy path: creates backup file at expected path', () => {
    const dbPath = path.join(tmpDir, 'source.db')
    const db = createRealDb(dbPath)
    const backupDir = path.join(tmpDir, 'backups')

    const writer = new BackupWriter(db, { backupDir, sourceVersion: 'v0.36.0' })
    const result = writer.write()

    expect(fs.existsSync(result.backupPath)).toBe(true)
    db.close()
  })

  it('filename matches pre-redesign-2026-from-v<ver>-<timestamp>.stina-backup pattern', () => {
    const dbPath = path.join(tmpDir, 'source.db')
    const db = createRealDb(dbPath)
    const backupDir = path.join(tmpDir, 'backups')

    const before = Date.now()
    const writer = new BackupWriter(db, { backupDir, sourceVersion: 'v0.36.0' })
    const result = writer.write()
    const after = Date.now()

    const filename = path.basename(result.backupPath)

    // Must start with the correct prefix.
    expect(filename).toMatch(/^pre-redesign-2026-from-v0\.36\.0-\d+\.stina-backup$/)

    // Timestamp must be within test window.
    const timestampMatch = filename.match(/-(\d+)\.stina-backup$/)
    expect(timestampMatch).not.toBeNull()
    const ts = parseInt(timestampMatch![1]!, 10)
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)

    db.close()
  })

  it('backup is readable and contains the expected table', () => {
    const dbPath = path.join(tmpDir, 'source.db')
    const db = createRealDb(dbPath)
    const backupDir = path.join(tmpDir, 'backups')

    const writer = new BackupWriter(db, { backupDir, sourceVersion: 'v0.5.0' })
    const result = writer.write()

    // Open the backup as a new database and verify contents.
    const backupDb = new Database(result.backupPath)
    const row = backupDb.prepare('SELECT value FROM test_data WHERE id = ?').get('row1') as
      | { value: string }
      | undefined
    expect(row?.value).toBe('hello')
    backupDb.close()
    db.close()
  })

  it('missing backup dir is auto-created', () => {
    const dbPath = path.join(tmpDir, 'source.db')
    const db = createRealDb(dbPath)
    // Nested dir that does not exist yet.
    const backupDir = path.join(tmpDir, 'nested', 'backups', 'dir')

    expect(fs.existsSync(backupDir)).toBe(false)

    const writer = new BackupWriter(db, { backupDir, sourceVersion: 'v1.2.3' })
    writer.write()

    expect(fs.existsSync(backupDir)).toBe(true)
    db.close()
  })

  it('version formats correctly: v0.36.0 → filename contains from-v0.36.0-', () => {
    const dbPath = path.join(tmpDir, 'source.db')
    const db = createRealDb(dbPath)
    const backupDir = path.join(tmpDir, 'backups')

    const writer = new BackupWriter(db, { backupDir, sourceVersion: 'v0.36.0' })
    const result = writer.write()

    const filename = path.basename(result.backupPath)
    expect(filename).toContain('from-v0.36.0-')
    db.close()
  })

  it('version without leading v also works (strips leading v only if present)', () => {
    const dbPath = path.join(tmpDir, 'source.db')
    const db = createRealDb(dbPath)
    const backupDir = path.join(tmpDir, 'backups')

    const writer = new BackupWriter(db, { backupDir, sourceVersion: '1.0.0' })
    const result = writer.write()

    const filename = path.basename(result.backupPath)
    expect(filename).toContain('from-v1.0.0-')
    db.close()
  })
})
