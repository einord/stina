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
import {
  getMemoryMigrationsPath,
  StandingInstructionRepository,
} from '@stina/memory/db'
import { asMemoryDb } from '../../asRedesign2026Db.js'
import { getAutonomyMigrationsPath } from '@stina/autonomy/db'
import { getChatMigrationsPath } from '@stina/chat/db'
import { getScenario, seed } from '@stina/test-fixtures'
import type Database from 'better-sqlite3'
import type { Thread, Message } from '@stina/core'
import type { DecisionTurnProducer } from '@stina/orchestrator'
import { threadRoutes } from '../threads.js'

/**
 * Build an isolated test app: temp DB path, fresh schema, stub auth that
 * always passes, threads routes registered. Each test gets its own DB so
 * state doesn't leak.
 */
async function buildTestApp(opts: { decisionTurnProducer?: DecisionTurnProducer } = {}): Promise<{
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

  await app.register(threadRoutes, opts.decisionTurnProducer ? { decisionTurnProducer: opts.decisionTurnProducer } : {})
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

      // The user message AND stina's stub reply should be in the thread —
      // creating a thread runs an immediate decision turn (canned stub for v1).
      const messages = (
        await app.inject({ method: 'GET', url: `/threads/${thread.id}/messages` })
      ).json() as Message[]
      expect(messages).toHaveLength(2)
      expect(messages[0]!.author).toBe('user')
      if (messages[0]!.author === 'user') {
        expect(messages[0]!.content.text).toBe('Hej Stina, vad finns på agendan idag?')
      }
      expect(messages[1]!.author).toBe('stina')
      expect(messages[1]!.visibility).toBe('normal')
      if (messages[1]!.author === 'stina') {
        expect(messages[1]!.content.text).toBeTruthy()
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

    it('decision turn injects active standing instructions into the canned stub reply', async () => {
      // Seed a standing instruction directly into the live memory schema
      // (the route uses DefaultMemoryContextLoader against the same DB).
      const memoryRepo = new StandingInstructionRepository(asMemoryDb(getDatabase()))
      await memoryRepo.create({
        rule: 'svara alltid kortfattat',
        scope: { channels: ['all'] },
        created_by: 'user',
      })

      const created = await app.inject({
        method: 'POST',
        url: '/threads',
        payload: { content: { text: 'fråga' } },
      })
      const thread = created.json() as Thread
      const messages = (
        await app.inject({ method: 'GET', url: `/threads/${thread.id}/messages` })
      ).json() as Message[]
      const stinaReply = messages.find((m) => m.author === 'stina')
      expect(stinaReply).toBeDefined()
      if (stinaReply && stinaReply.author === 'stina') {
        // Stub formats the count when memory is non-empty.
        expect(stinaReply.content.text).toMatch(/1 viktigt minne/)
      }
    })

    it('runs the decision turn after appending the user message', async () => {
      seed(rawDb, getScenario('typical-morning'))
      const before = (
        await app.inject({ method: 'GET', url: '/threads/morning-quiet-001/messages' })
      ).json() as Message[]
      await app.inject({
        method: 'POST',
        url: '/threads/morning-quiet-001/messages',
        payload: { content: { text: 'Och nu?' } },
      })
      const after = (
        await app.inject({ method: 'GET', url: '/threads/morning-quiet-001/messages' })
      ).json() as Message[]
      // We added two new messages (user + stina stub), and at least one of the
      // new ones is a stina stub reply with the canned marker text.
      expect(after.length).toBe(before.length + 2)
      const newOnes = after.slice(before.length)
      expect(newOnes.some((m) => m.author === 'user')).toBe(true)
      const stinaReply = newOnes.find((m) => m.author === 'stina')
      expect(stinaReply).toBeDefined()
      if (stinaReply && stinaReply.author === 'stina') {
        expect(stinaReply.content.text).toMatch(/Stub-svar/)
      }
    })
  })

  describe('decisionTurnProducer override', () => {
    let custom: { app: FastifyInstance; dbPath: string }

    afterEach(async () => {
      if (custom) {
        await teardownApp(custom.app, custom.dbPath)
      }
    })

    it('uses the injected producer instead of the canned stub', async () => {
      const producer: DecisionTurnProducer = async () => ({
        visibility: 'normal',
        content: { text: 'INJECTED REPLY' },
      })
      // Tear down the default beforeEach app so we can register a fresh one
      // with the producer wired in.
      await teardownApp(app, dbPath)
      const ctx = await buildTestApp({ decisionTurnProducer: producer })
      custom = { app: ctx.app, dbPath: ctx.dbPath }
      app = ctx.app
      dbPath = ctx.dbPath

      const created = await app.inject({
        method: 'POST',
        url: '/threads',
        payload: { content: { text: 'fråga' } },
      })
      const thread = created.json() as Thread
      const messages = (
        await app.inject({ method: 'GET', url: `/threads/${thread.id}/messages` })
      ).json() as Message[]
      expect(messages).toHaveLength(2)
      const stina = messages[1]!
      expect(stina.author).toBe('stina')
      if (stina.author === 'stina') {
        expect(stina.content.text).toBe('INJECTED REPLY')
      }
    })
  })

  describe('SSE streaming endpoints', () => {
    /**
     * Parse a `data: <json>\n\n` SSE body into a list of events. Permissive
     * about trailing whitespace and empty separator chunks.
     */
    function parseSseBody(body: string): unknown[] {
      const events: unknown[] = []
      for (const block of body.split('\n\n')) {
        const trimmed = block.trim()
        if (!trimmed.startsWith('data:')) continue
        const json = trimmed.slice('data:'.length).trim()
        if (!json) continue
        events.push(JSON.parse(json))
      }
      return events
    }

    it('POST /threads/stream creates a thread and streams thread_created → user_message → content_delta → message_appended → done', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/threads/stream',
        payload: { content: { text: 'Hej Stina!' } },
      })
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('text/event-stream')

      const events = parseSseBody(res.body) as Array<{ type: string }>
      const types = events.map((e) => e.type)
      expect(types[0]).toBe('thread_created')
      expect(types[1]).toBe('user_message')
      expect(types).toContain('content_delta')
      expect(types).toContain('message_appended')
      expect(types[types.length - 1]).toBe('done')
    })

    it('POST /threads/:id/messages/stream returns 404 for missing thread (no SSE hijack)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/threads/no-such-thread/messages/stream',
        payload: { content: { text: 'hej' } },
      })
      expect(res.statusCode).toBe(404)
      // Pre-stream errors come back as plain JSON, not SSE.
      expect(res.headers['content-type']).not.toContain('text/event-stream')
    })

    it('POST /threads/:id/messages/stream rejects archived threads with 409 before opening SSE', async () => {
      seed(rawDb, getScenario('typical-morning'))
      const res = await app.inject({
        method: 'POST',
        url: '/threads/morning-archived-001/messages/stream',
        payload: { content: { text: 'hej' } },
      })
      expect(res.statusCode).toBe(409)
    })

    it('POST /threads/:id/messages/stream emits the expected event sequence on the happy path', async () => {
      seed(rawDb, getScenario('typical-morning'))
      const res = await app.inject({
        method: 'POST',
        url: '/threads/morning-quiet-001/messages/stream',
        payload: { content: { text: 'och nu?' } },
      })
      expect(res.statusCode).toBe(200)
      const events = parseSseBody(res.body) as Array<{ type: string }>
      const types = events.map((e) => e.type)
      expect(types[0]).toBe('user_message')
      expect(types).toContain('content_delta')
      expect(types).toContain('message_appended')
      expect(types[types.length - 1]).toBe('done')
    })
  })
})
