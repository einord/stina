import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clearRedesign2026Tables, getScenario, scenarios, seed } from '../index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Apply ALL three packages' migrations to an in-memory DB. The seeder writes
 * across threads/messages/memory/autonomy tables and FKs are enforced.
 */
function createTestDb(): Database.Database {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')

  const packages = ['threads', 'memory', 'autonomy']
  for (const pkg of packages) {
    const migrationsDir = path.join(__dirname, '..', '..', '..', pkg, 'src', 'db', 'migrations')
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
      sqlite.exec(sql)
    }
  }
  return sqlite
}

describe('seed()', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  it('seeds the fresh-install scenario', () => {
    const scenario = getScenario('fresh-install')
    const counts = seed(db, scenario)

    expect(counts.threads).toBe(1)
    expect(counts.messages).toBe(1)
    expect(counts.standing_instructions).toBe(0)
    expect(counts.profile_facts).toBe(0)

    const threadCount = (
      db.prepare('SELECT COUNT(*) AS n FROM threads').get() as { n: number }
    ).n
    expect(threadCount).toBe(1)
  })

  it('seeds the typical-morning scenario fully', () => {
    const scenario = getScenario('typical-morning')
    const counts = seed(db, scenario)

    expect(counts.threads).toBe(scenario.threads.length)
    expect(counts.messages).toBe(scenario.messages.length)
    expect(counts.standing_instructions).toBe(scenario.standing_instructions.length)
    expect(counts.profile_facts).toBe(scenario.profile_facts.length)
    expect(counts.activity_log_entries).toBe(scenario.activity_log_entries.length)

    // FK integrity: every message's thread_id must resolve.
    const orphanMessages = (
      db
        .prepare(
          'SELECT COUNT(*) AS n FROM messages WHERE thread_id NOT IN (SELECT id FROM threads)'
        )
        .get() as { n: number }
    ).n
    expect(orphanMessages).toBe(0)

    // The recap thread should exist and be surfaced.
    const recap = db
      .prepare(`SELECT * FROM threads WHERE id = 'morning-recap-001'`)
      .get() as { surfaced_at: number | null; notified_at: number | null } | undefined
    expect(recap).toBeDefined()
    expect(recap!.surfaced_at).not.toBeNull()
  })

  it('seeds the vacation-mode-active scenario', () => {
    const scenario = getScenario('vacation-mode-active')
    const counts = seed(db, scenario)

    expect(counts.standing_instructions).toBe(1)
    expect(counts.auto_policies).toBe(1)

    // The four auto-replied threads should be background (surfaced_at IS NULL).
    const background = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM threads WHERE surfaced_at IS NULL AND id LIKE 'vac-mail-auto-%'`
        )
        .get() as { n: number }
    ).n
    expect(background).toBe(4)

    // The escalation thread should be surfaced.
    const escalation = db
      .prepare(`SELECT * FROM threads WHERE id = 'vac-mail-escalation-001'`)
      .get() as { surfaced_at: number | null } | undefined
    expect(escalation!.surfaced_at).not.toBeNull()
  })

  it('clearRedesign2026Tables empties all tables', () => {
    seed(db, getScenario('typical-morning'))
    clearRedesign2026Tables(db)

    const tables = ['threads', 'messages', 'standing_instructions', 'profile_facts', 'thread_summaries', 'auto_policies', 'activity_log_entries']
    for (const table of tables) {
      const n = (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
      expect(n).toBe(0)
    }
  })

  it('every registered scenario seeds without errors', () => {
    for (const id of Object.keys(scenarios)) {
      const fresh = createTestDb()
      const scenario = getScenario(id)
      expect(() => seed(fresh, scenario)).not.toThrow()
      fresh.close()
    }
  })
})
