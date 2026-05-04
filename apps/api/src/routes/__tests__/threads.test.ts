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
import type { Thread, Message } from '@stina/core'
import { threadRoutes } from '../threads.js'

/**
 * Build an isolated test app: temp DB path, fresh schema, stub auth that
 * always passes, threads routes registered. Each test gets its own DB so
 * state doesn't leak.
 */
async function buildTestApp(): Promise<{
  app: FastifyInstance
  dbPath: string
  rawDb: Database.Database
}> {
  // adapters-node holds a singleton DB at two layers — close the connection
  // and reset the appDatabase cache so a subsequent initDatabase honors a
  // new path.
  closeDb()
  resetDatabaseForTests()

  const dbPath = path.join(
    os.tmpdir(),
    `stina-threads-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
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

  // Underlying raw handle for direct seeding.
  const rawDb = (getDatabase() as unknown as { $client: Database.Database }).$client

  const app = Fastify({ logger: false })
  // Stub the auth decorators requireAuth checks for. requireAuth only looks
  // at request.isAuthenticated and request.user, so populating those via
  // decorateRequest is enough to make protected routes accessible in tests.
  app.decorateRequest('isAuthenticated', false)
  app.decorateRequest('user', null)
  app.addHook('onRequest', async (request) => {
    ;(request as unknown as { isAuthenticated: boolean }).isAuthenticated = true
    ;(request as unknown as { user: { id: string; role: string } }).user = {
      id: 'test-user',
      role: 'user',
    }
  })

  await app.register(threadRoutes)
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

describe('threadRoutes', () => {
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

  describe('GET /threads', () => {
    it('returns an empty list when nothing is seeded', async () => {
      const res = await app.inject({ method: 'GET', url: '/threads' })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual([])
    })

    it('lists all threads from typical-morning', async () => {
      seed(rawDb, getScenario('typical-morning'))
      const res = await app.inject({ method: 'GET', url: '/threads' })
      expect(res.statusCode).toBe(200)
      const threads = res.json() as Thread[]
      expect(threads).toHaveLength(7)
      // Most-recent-activity first; recap thread is first.
      expect(threads[0]!.id).toBe('morning-recap-001')
    })

    it('filters by status', async () => {
      seed(rawDb, getScenario('typical-morning'))
      const archivedRes = await app.inject({ method: 'GET', url: '/threads?status=archived' })
      const archived = archivedRes.json() as Thread[]
      expect(archived.map((t) => t.id)).toEqual(['morning-archived-001'])
    })

    it('filters surfacing=background', async () => {
      seed(rawDb, getScenario('typical-morning'))
      const res = await app.inject({ method: 'GET', url: '/threads?surfacing=background' })
      const threads = res.json() as Thread[]
      // Two background threads in this scenario: newsletter mail and cancelled calendar event.
      expect(threads.map((t) => t.id).sort()).toEqual(['morning-cal-001', 'morning-mail-002'])
    })

    it('filters by triggerKind=mail', async () => {
      seed(rawDb, getScenario('typical-morning'))
      const res = await app.inject({ method: 'GET', url: '/threads?triggerKind=mail' })
      const threads = res.json() as Thread[]
      expect(threads).toHaveLength(2)
      expect(threads.every((t) => t.trigger.kind === 'mail')).toBe(true)
    })

    it('rejects invalid status', async () => {
      const res = await app.inject({ method: 'GET', url: '/threads?status=bogus' })
      expect(res.statusCode).toBe(400)
    })

    it('rejects out-of-range limit', async () => {
      const res = await app.inject({ method: 'GET', url: '/threads?limit=10000' })
      expect(res.statusCode).toBe(400)
    })
  })

  describe('GET /threads/:id', () => {
    it('returns the thread when it exists', async () => {
      seed(rawDb, getScenario('typical-morning'))
      const res = await app.inject({ method: 'GET', url: '/threads/morning-recap-001' })
      expect(res.statusCode).toBe(200)
      const thread = res.json() as Thread
      expect(thread.id).toBe('morning-recap-001')
      expect(thread.trigger.kind).toBe('stina')
    })

    it('returns 404 when the thread does not exist', async () => {
      const res = await app.inject({ method: 'GET', url: '/threads/nonexistent' })
      expect(res.statusCode).toBe(404)
    })
  })

  describe('GET /threads/:id/messages', () => {
    it('returns messages oldest-first by default, excluding silent ones', async () => {
      seed(rawDb, getScenario('vacation-mode-active'))
      // The first auto-replied mail thread has one app message and one
      // silent stina-reasoning message. Default should exclude silent.
      const res = await app.inject({
        method: 'GET',
        url: '/threads/vac-mail-auto-001/messages',
      })
      expect(res.statusCode).toBe(200)
      const messages = res.json() as Message[]
      expect(messages).toHaveLength(1)
      expect(messages[0]!.author).toBe('app')
    })

    it('returns silent messages when includeSilent=true', async () => {
      seed(rawDb, getScenario('vacation-mode-active'))
      const res = await app.inject({
        method: 'GET',
        url: '/threads/vac-mail-auto-001/messages?includeSilent=true',
      })
      const messages = res.json() as Message[]
      expect(messages.length).toBeGreaterThanOrEqual(2)
      expect(messages.some((m) => m.visibility === 'silent')).toBe(true)
    })

    it('returns 404 when the thread does not exist', async () => {
      const res = await app.inject({ method: 'GET', url: '/threads/nope/messages' })
      expect(res.statusCode).toBe(404)
    })
  })

  describe('GET /threads/:id/activity', () => {
    it('returns activity log entries for the thread, oldest-first', async () => {
      seed(rawDb, getScenario('typical-morning'))
      // The customer mail thread (morning-mail-001) has memory_change + auto_action
      // entries plus an event_silenced for the related background thread — the
      // route returns entries scoped to the *given* thread only.
      const res = await app.inject({
        method: 'GET',
        url: '/threads/morning-mail-001/activity',
      })
      expect(res.statusCode).toBe(200)
      const entries = res.json() as Array<{ thread_id: string | null; created_at: number; kind: string }>
      expect(entries.length).toBeGreaterThan(0)
      // All entries belong to this thread
      for (const e of entries) {
        expect(e.thread_id).toBe('morning-mail-001')
      }
      // Chronological order
      for (let i = 1; i < entries.length; i++) {
        expect(entries[i]!.created_at).toBeGreaterThanOrEqual(entries[i - 1]!.created_at)
      }
    })

    it('returns empty array when the thread has no activity', async () => {
      seed(rawDb, getScenario('fresh-install'))
      const res = await app.inject({
        method: 'GET',
        url: '/threads/fresh-welcome-001/activity',
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual([])
    })

    it('returns 404 for a non-existent thread', async () => {
      const res = await app.inject({ method: 'GET', url: '/threads/nope/activity' })
      expect(res.statusCode).toBe(404)
    })
  })

  describe('POST /threads', () => {
    it('creates a user-triggered thread with the first message', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/threads',
        payload: { content: { text: 'Hej Stina, vad finns på agendan idag?' } },
      })
      expect(res.statusCode).toBe(201)
      const thread = res.json() as Thread
      expect(thread.trigger.kind).toBe('user')
      // User threads surface immediately.
      expect(thread.surfaced_at).not.toBeNull()
      // Auto-derived title from the first sentence.
      expect(thread.title.length).toBeGreaterThan(0)
      expect(thread.title.length).toBeLessThanOrEqual(60)

      // The first message is in the thread.
      const messages = (
        await app.inject({ method: 'GET', url: `/threads/${thread.id}/messages` })
      ).json() as Message[]
      expect(messages).toHaveLength(1)
      expect(messages[0]!.author).toBe('user')
      if (messages[0]!.author === 'user') {
        expect(messages[0]!.content.text).toBe('Hej Stina, vad finns på agendan idag?')
      }
    })

    it('honors a user-supplied title', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/threads',
        payload: { title: 'Q3-planeringen', content: { text: 'Behöver diskutera Q3.' } },
      })
      const thread = res.json() as Thread
      expect(thread.title).toBe('Q3-planeringen')
    })

    it('rejects empty content', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/threads',
        payload: { content: { text: '   ' } },
      })
      expect(res.statusCode).toBe(400)
    })

    it('rejects missing content', async () => {
      const res = await app.inject({ method: 'POST', url: '/threads', payload: {} })
      expect(res.statusCode).toBe(400)
    })
  })

  describe('POST /threads/:id/messages', () => {
    it('appends a user message to an existing thread', async () => {
      seed(rawDb, getScenario('typical-morning'))
      const res = await app.inject({
        method: 'POST',
        url: '/threads/morning-quiet-001/messages',
        payload: { content: { text: 'Vad är status nu?' } },
      })
      expect(res.statusCode).toBe(201)
      const message = res.json() as Message
      expect(message.author).toBe('user')

      // The quiet thread should have been auto-revived to active.
      const updated = (
        await app.inject({ method: 'GET', url: '/threads/morning-quiet-001' })
      ).json() as Thread
      expect(updated.status).toBe('active')
    })

    it('rejects appending to an archived thread', async () => {
      seed(rawDb, getScenario('typical-morning'))
      const res = await app.inject({
        method: 'POST',
        url: '/threads/morning-archived-001/messages',
        payload: { content: { text: 'Hej' } },
      })
      expect(res.statusCode).toBe(409)
    })

    it('returns 404 for non-existent thread', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/threads/nope/messages',
        payload: { content: { text: 'Hej' } },
      })
      expect(res.statusCode).toBe(404)
    })
  })
})
