import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { autonomySchema, ToolSeveritySnapshotRepository } from '../db/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function createTestDb(): BetterSQLite3Database<typeof autonomySchema> {
  const sqlite = new Database(':memory:')
  // Stub threads table for FKs (real wiring runs all migrations together).
  sqlite.exec(`CREATE TABLE threads (id TEXT PRIMARY KEY)`)

  const migrationsDir = path.join(__dirname, '..', 'db', 'migrations')
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
    sqlite.exec(sql)
  }
  return drizzle(sqlite, { schema: autonomySchema })
}

describe('ToolSeveritySnapshotRepository', () => {
  let db: BetterSQLite3Database<typeof autonomySchema>
  let repo: ToolSeveritySnapshotRepository

  beforeEach(() => {
    db = createTestDb()
    repo = new ToolSeveritySnapshotRepository(db)
  })

  it('first call returns { previous: null, current, didChange: false }', async () => {
    const result = await repo.compare('ext1', 'tool1', 'medium')
    expect(result.previous).toBeNull()
    expect(result.current).toBe('medium')
    expect(result.didChange).toBe(false)
  })

  it('second call with the same severity returns didChange: false', async () => {
    await repo.recordSeen('ext1', 'tool1', 'medium')
    const result = await repo.compare('ext1', 'tool1', 'medium')
    expect(result.previous).toBe('medium')
    expect(result.current).toBe('medium')
    expect(result.didChange).toBe(false)
  })

  it('second call with different severity returns didChange: true', async () => {
    await repo.recordSeen('ext1', 'tool1', 'medium')
    const result = await repo.compare('ext1', 'tool1', 'high')
    expect(result.previous).toBe('medium')
    expect(result.current).toBe('high')
    expect(result.didChange).toBe(true)
  })

  it('multiple (extensionId, toolId) tuples are isolated', async () => {
    await repo.recordSeen('ext1', 'tool1', 'medium')
    await repo.recordSeen('ext1', 'tool2', 'low')
    await repo.recordSeen('ext2', 'tool1', 'high')

    const r1 = await repo.compare('ext1', 'tool1', 'medium')
    expect(r1.previous).toBe('medium')
    expect(r1.didChange).toBe(false)

    const r2 = await repo.compare('ext1', 'tool2', 'high')
    expect(r2.previous).toBe('low')
    expect(r2.didChange).toBe(true)

    const r3 = await repo.compare('ext2', 'tool1', 'critical')
    expect(r3.previous).toBe('high')
    expect(r3.didChange).toBe(true)

    // Completely new combination has no snapshot
    const r4 = await repo.compare('ext2', 'tool2', 'medium')
    expect(r4.previous).toBeNull()
    expect(r4.didChange).toBe(false)
  })
})
