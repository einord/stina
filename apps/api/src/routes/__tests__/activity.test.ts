import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import {
  closeDb,
  initDatabase,
  getDatabase,
  createConsoleLogger,
  resetDatabaseForTests,
} from '@stina/adapters-node'
import { getThreadsMigrationsPath } from '@stina/threads/db'
import { getMemoryMigrationsPath } from '@stina/memory/db'
import { getAutonomyMigrationsPath } from '@stina/autonomy/db'
import { getChatMigrationsPath } from '@stina/chat/db'
import { getScenario, seed } from '@stina/test-fixtures'
import type Database from 'better-sqlite3'
import type { ActivityLogEntry } from '@stina/core'
import { activityRoutes } from '../activity.js'

// The deterministic-fixtures helpers anchor timestamps to a fixed instant
// (FIXTURE_NOW_MS = 2026-05-04T08:00:00Z), not Date.now(). For date-range
// assertions we use that anchor so the test is independent of wall-clock
// time. Keep this in sync with packages/test-fixtures/src/factories/
// deterministic.ts if the anchor ever moves.
const FIXTURE_NOW_MS = Date.UTC(2026, 4, 4, 8, 0, 0)

/**
 * Build an isolated test app: temp DB path, fresh schema, stub auth that
 * always passes, activity routes registered. Mirrors the threads test
 * harness — the auth stub pattern is documented in
 * docs/redesign-2026/IMPLEMENTATION-STATUS.md §"Auth stubbing in route tests".
 */
async function buildTestApp(): Promise<{
  app: FastifyInstance
  dbPath: string
  rawDb: Database.Database
}> {
  closeDb()
  resetDatabaseForTests()

  const dbPath = path.join(
    os.tmpdir(),
    `stina-activity-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
  )
  const logger = createConsoleLogger('error')
  initDatabase({
    logger,
    dbPath,
    migrations: [
      getChatMigrationsPath(),
      getThreadsMigrationsPath(),
      getMemoryMigrationsPath(),
      getAutonomyMigrationsPath(),
    ],
  })

  const rawDb = (getDatabase() as unknown as { $client: Database.Database }).$client

  const app = Fastify({ logger: false })
  app.decorateRequest('isAuthenticated', false)
  app.decorateRequest('user', null)
  app.addHook('onRequest', async (request) => {
    ;(request as unknown as { isAuthenticated: boolean }).isAuthenticated = true
    ;(request as unknown as { user: { id: string; role: string } }).user = {
      id: 'test-user',
      role: 'user',
    }
  })

  await app.register(activityRoutes)
  await app.ready()

  return { app, dbPath, rawDb }
}

async function teardownApp(app: FastifyInstance, dbPath: string): Promise<void> {
  await app.close()
  closeDb()
  resetDatabaseForTests()
  if (fs.existsSync(dbPath)) {
    try {
      fs.unlinkSync(dbPath)
    } catch {
      // ignore — WAL may hold the file briefly
    }
  }
}

describe('activityRoutes', () => {
  let app: FastifyInstance
  let dbPath: string
  let rawDb: Database.Database

  beforeEach(async () => {
    const ctx = await buildTestApp()
    app = ctx.app
    dbPath = ctx.dbPath
    rawDb = ctx.rawDb
  })

  afterEach(async () => {
    await teardownApp(app, dbPath)
  })

  describe('GET /activity', () => {
    it('returns an empty list when nothing is seeded', async () => {
      const res = await app.inject({ method: 'GET', url: '/activity' })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual([])
    })

    it('lists all activity entries from typical-morning, ordered desc', async () => {
      seed(rawDb, getScenario('typical-morning'))
      const res = await app.inject({ method: 'GET', url: '/activity' })
      expect(res.statusCode).toBe(200)
      const entries = res.json() as ActivityLogEntry[]
      // The seeded scenario has 6 activity log entries (dream_pass_run +
      // dream_pass_flag + memory_change + 2 event_silenced + auto_action).
      expect(entries.length).toBe(6)
      // Newest-first ordering.
      for (let i = 1; i < entries.length; i++) {
        expect(entries[i - 1]!.created_at).toBeGreaterThanOrEqual(entries[i]!.created_at)
      }
    })

    it('filters by single kind', async () => {
      seed(rawDb, getScenario('typical-morning'))
      const res = await app.inject({ method: 'GET', url: '/activity?kind=auto_action' })
      const entries = res.json() as ActivityLogEntry[]
      expect(entries.length).toBe(1)
      expect(entries[0]!.kind).toBe('auto_action')
    })

    it('filters by multiple comma-separated kinds', async () => {
      seed(rawDb, getScenario('typical-morning'))
      const res = await app.inject({
        method: 'GET',
        url: '/activity?kind=dream_pass_run,dream_pass_flag',
      })
      const entries = res.json() as ActivityLogEntry[]
      expect(entries.length).toBe(2)
      for (const e of entries) {
        expect(['dream_pass_run', 'dream_pass_flag']).toContain(e.kind)
      }
    })

    it('filters by severity', async () => {
      seed(rawDb, getScenario('typical-morning'))
      const res = await app.inject({ method: 'GET', url: '/activity?severity=high' })
      const entries = res.json() as ActivityLogEntry[]
      expect(entries.length).toBeGreaterThan(0)
      for (const e of entries) {
        expect(e.severity).toBe('high')
      }
    })

    it('filters by after timestamp', async () => {
      seed(rawDb, getScenario('typical-morning'))
      // The auto_action is the newest entry (45 min before FIXTURE_NOW_MS);
      // the dream_pass entries are 6h before. Pick a cutoff one hour before
      // FIXTURE_NOW_MS — the auto_action and the memory_change at ~2h before
      // would overlap, so use a tighter 1h window: only auto_action passes.
      const cutoff = FIXTURE_NOW_MS - 60 * 60 * 1000
      const res = await app.inject({
        method: 'GET',
        url: `/activity?after=${cutoff}`,
      })
      const entries = res.json() as ActivityLogEntry[]
      expect(entries.length).toBeGreaterThan(0)
      for (const e of entries) {
        expect(e.created_at).toBeGreaterThan(cutoff)
      }
    })

    it('filters by before timestamp', async () => {
      seed(rawDb, getScenario('typical-morning'))
      const cutoff = FIXTURE_NOW_MS - 60 * 60 * 1000
      const res = await app.inject({
        method: 'GET',
        url: `/activity?before=${cutoff}`,
      })
      const entries = res.json() as ActivityLogEntry[]
      expect(entries.length).toBeGreaterThan(0)
      for (const e of entries) {
        expect(e.created_at).toBeLessThan(cutoff)
      }
    })

    it('rejects invalid kind enum', async () => {
      const res = await app.inject({ method: 'GET', url: '/activity?kind=bogus' })
      expect(res.statusCode).toBe(400)
    })

    it('rejects invalid severity enum', async () => {
      const res = await app.inject({ method: 'GET', url: '/activity?severity=bogus' })
      expect(res.statusCode).toBe(400)
    })

    it('rejects out-of-range limit', async () => {
      const res = await app.inject({ method: 'GET', url: '/activity?limit=10000' })
      expect(res.statusCode).toBe(400)
    })

    it('rejects non-integer limit', async () => {
      const res = await app.inject({ method: 'GET', url: '/activity?limit=abc' })
      expect(res.statusCode).toBe(400)
    })

    it('rejects negative after', async () => {
      const res = await app.inject({ method: 'GET', url: '/activity?after=-1' })
      expect(res.statusCode).toBe(400)
    })

    it('honors limit', async () => {
      seed(rawDb, getScenario('typical-morning'))
      const res = await app.inject({ method: 'GET', url: '/activity?limit=2' })
      const entries = res.json() as ActivityLogEntry[]
      expect(entries.length).toBe(2)
    })

    it('combines kind and severity filters', async () => {
      seed(rawDb, getScenario('typical-morning'))
      const res = await app.inject({
        method: 'GET',
        url: '/activity?kind=auto_action&severity=high',
      })
      const entries = res.json() as ActivityLogEntry[]
      expect(entries.length).toBe(1)
      expect(entries[0]!.kind).toBe('auto_action')
      expect(entries[0]!.severity).toBe('high')
    })
  })
})
