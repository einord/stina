/**
 * Integration test: emitEvent host callback
 *
 * Exercises the full emitThreadEvent pipeline: creates a server with the
 * callback wired, invokes the callback directly, then asserts the resulting
 * thread is visible via GET /threads and has the expected messages + Stina reply.
 *
 * Primary evidence for Phase 8a (§04). The integration does NOT require a
 * tool-capable provider — the canned stub fires when no model is configured.
 */

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
import { getThreadsMigrationsPath, ThreadRepository } from '@stina/threads/db'
import { getMemoryMigrationsPath, StandingInstructionRepository, ProfileFactRepository } from '@stina/memory/db'
import { getAutonomyMigrationsPath } from '@stina/autonomy/db'
import { getChatMigrationsPath } from '@stina/chat/db'
import { runDecisionTurn, DefaultMemoryContextLoader } from '@stina/orchestrator'
import { asThreadsDb, asMemoryDb } from '../asRedesign2026Db.js'
import { threadRoutes } from '../routes/threads.js'
import type { Thread, Message } from '@stina/core'
import { deriveTitleFromAppContent, type EmitThreadEventInput } from '@stina/extension-host'

// ─── Test app builder ───────────────────────────────────────────────────────

async function buildTestApp(): Promise<{
  app: FastifyInstance
  dbPath: string
  emitThreadEvent: (input: EmitThreadEventInput) => Promise<{ thread_id: string }>
}> {
  closeDb()
  resetDatabaseForTests()

  const dbPath = path.join(
    os.tmpdir(),
    `stina-emitevent-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
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

  await app.register(threadRoutes, {})
  await app.ready()

  // The emitThreadEvent callback mirrors server.ts production wiring.
  // No provider is configured so the canned stub fires for the decision turn.
  const emitThreadEvent = async (input: EmitThreadEventInput): Promise<{ thread_id: string }> => {
    const rawDb = getDatabase()
    const repo = new ThreadRepository(asThreadsDb(rawDb))

    const title = deriveTitleFromAppContent(input.content)
    const thread = await repo.create({ trigger: input.trigger, title })

    await repo.appendMessage({
      thread_id: thread.id,
      author: 'app',
      visibility: 'normal',
      source: input.source,
      content: input.content,
    })

    const memoryLoader = new DefaultMemoryContextLoader(
      new StandingInstructionRepository(asMemoryDb(rawDb)),
      new ProfileFactRepository(asMemoryDb(rawDb))
    )
    // No producer → canned stub fires, produces a normal Stina reply.
    await runDecisionTurn({ threadId: thread.id, threadRepo: repo, memoryLoader })

    return { thread_id: thread.id }
  }

  return { app, dbPath, emitThreadEvent }
}

async function teardownApp(app: FastifyInstance, dbPath: string): Promise<void> {
  await app.close()
  closeDb()
  resetDatabaseForTests()
  if (fs.existsSync(dbPath)) {
    try {
      fs.unlinkSync(dbPath)
    } catch {
      // ignore
    }
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('emitEvent integration', () => {
  let app: FastifyInstance
  let dbPath: string
  let emitThreadEvent: (input: EmitThreadEventInput) => Promise<{ thread_id: string }>

  beforeEach(async () => {
    const ctx = await buildTestApp()
    app = ctx.app
    dbPath = ctx.dbPath
    emitThreadEvent = ctx.emitThreadEvent
  })

  afterEach(async () => {
    await teardownApp(app, dbPath)
  })

  it('spawns a mail-triggered thread visible in GET /threads, with AppMessage + Stina reply', async () => {
    const extensionId = 'stina-ext-mail-test'
    const mail_id = 'test-mail-001'

    const { thread_id } = await emitThreadEvent({
      trigger: { kind: 'mail', extension_id: extensionId, mail_id },
      content: {
        kind: 'mail',
        from: 'fake@example.com',
        subject: 'Testmail från dev-test',
        snippet: 'Hej, det här är ett genererat testmail.',
        mail_id,
      },
      source: { extension_id: extensionId },
    })

    expect(thread_id).toBeTruthy()

    // 1. GET /threads shows the new thread
    const threadsRes = await app.inject({ method: 'GET', url: '/threads' })
    expect(threadsRes.statusCode).toBe(200)
    const threads = threadsRes.json() as Thread[]
    const thread = threads.find((t) => t.id === thread_id)
    expect(thread).toBeDefined()
    expect(thread!.trigger.kind).toBe('mail')
    expect(thread!.title).toBe('Mail från fake@example.com: Testmail från dev-test')

    // 2. Thread messages: first is an AppMessage with mail content + correct source.extension_id
    const messagesRes = await app.inject({ method: 'GET', url: `/threads/${thread_id}/messages` })
    expect(messagesRes.statusCode).toBe(200)
    const messages = messagesRes.json() as Message[]

    const appMsg = messages.find((m) => m.author === 'app')
    expect(appMsg).toBeDefined()
    if (appMsg && appMsg.author === 'app') {
      expect(appMsg.source.extension_id).toBe(extensionId)
      const content = appMsg.content as { kind: string; from?: string; subject?: string }
      expect(content.kind).toBe('mail')
      expect(content.from).toBe('fake@example.com')
      expect(content.subject).toBe('Testmail från dev-test')
    }

    // 3. Stina's reply is present (canned stub produces a normal-visibility message)
    const stinaMsg = messages.find((m) => m.author === 'stina')
    expect(stinaMsg).toBeDefined()
    if (stinaMsg && stinaMsg.author === 'stina') {
      expect(stinaMsg.visibility).toBe('normal')
      expect(stinaMsg.content.text).toBeTruthy()
    }

    // 4. surfaced_at is set (canned stub emits a normal-visibility message which surfaces the thread)
    // The thread is surfaced by the decision turn when it appends a normal stina message.
    // Check thread again — surfaced_at should be set after runDecisionTurn.
    const threadRes = await app.inject({ method: 'GET', url: `/threads/${thread_id}` })
    const refreshed = threadRes.json() as Thread
    expect(refreshed.surfaced_at).not.toBeNull()
  })

  it('title truncation: exceeding 200 codepoints appends ellipsis', async () => {
    const longSubject = 'A'.repeat(250) // will make "Mail från fake@example.com: A..." > 200 cp
    const mail_id = 'long-mail-001'

    const { thread_id } = await emitThreadEvent({
      trigger: { kind: 'mail', extension_id: 'ext', mail_id },
      content: {
        kind: 'mail',
        from: 'sender@example.com',
        subject: longSubject,
        snippet: 'snippet',
        mail_id,
      },
      source: { extension_id: 'ext' },
    })

    const threadRes = await app.inject({ method: 'GET', url: `/threads/${thread_id}` })
    const thread = threadRes.json() as Thread
    const codepoints = [...thread.title]
    expect(codepoints.length).toBeLessThanOrEqual(200)
    expect(thread.title.endsWith('…')).toBe(true)
  })
})
