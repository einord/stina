import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { autonomySchema, RuntimeMarkersRepository } from '../db/index.js'

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

describe('RuntimeMarkersRepository', () => {
  let db: BetterSQLite3Database<typeof autonomySchema>
  let repo: RuntimeMarkersRepository

  beforeEach(() => {
    db = createTestDb()
    repo = new RuntimeMarkersRepository(db)
  })

  it('has returns false for an unset key', async () => {
    const result = await repo.has('welcome_thread_v1', 'user-1')
    expect(result).toBe(false)
  })

  it('set then has returns true', async () => {
    await repo.set('welcome_thread_v1', 'user-1')
    const result = await repo.has('welcome_thread_v1', 'user-1')
    expect(result).toBe(true)
  })

  it('different userIds with the same markerKey are isolated', async () => {
    await repo.set('welcome_thread_v1', 'user-a')

    // user-a marker exists
    expect(await repo.has('welcome_thread_v1', 'user-a')).toBe(true)
    // user-b marker does NOT exist
    expect(await repo.has('welcome_thread_v1', 'user-b')).toBe(false)
  })
})
