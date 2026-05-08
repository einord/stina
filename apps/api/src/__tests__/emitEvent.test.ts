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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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
import { getAutonomyMigrationsPath, ActivityLogRepository } from '@stina/autonomy/db'
import { getChatMigrationsPath } from '@stina/chat/db'
import { runDecisionTurn, DefaultMemoryContextLoader, applyFailureFraming, spawnTriggeredThread, DegradedModeTracker, DEGRADED_MODE_FAILURE_THRESHOLD } from '@stina/orchestrator'
import { asThreadsDb, asMemoryDb, asAutonomyDb } from '../asRedesign2026Db.js'
import { threadRoutes } from '../routes/threads.js'
import type { Thread, Message } from '@stina/core'
import { RUNTIME_EXTENSION_ID } from '@stina/core'
import type { AppMessage } from '@stina/core'
import { deriveTitleFromAppContent, deriveLinkedEntities, type EmitThreadEventInput } from '@stina/extension-host'
import type { DecisionTurnProducer } from '@stina/orchestrator'

// ─── Test app builder ───────────────────────────────────────────────────────

async function buildTestApp(options?: {
  /** Inject a producer that throws to test the failure-framing path. */
  failureProducer?: DecisionTurnProducer
  /** Optional degraded-mode tracker to pass into the pipeline. */
  tracker?: DegradedModeTracker
}): Promise<{
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

  // The emitThreadEvent callback mirrors server.ts production wiring,
  // including the try/catch + applyFailureFraming path (via spawnTriggeredThread).
  const emitThreadEvent = async (input: EmitThreadEventInput): Promise<{ thread_id: string }> => {
    const rawDb = getDatabase()
    const repo = new ThreadRepository(asThreadsDb(rawDb))
    const memoryLoader = new DefaultMemoryContextLoader(
      new StandingInstructionRepository(asMemoryDb(rawDb)),
      new ProfileFactRepository(asMemoryDb(rawDb))
    )
    const activityLogRepo = new ActivityLogRepository(asAutonomyDb(rawDb))

    return spawnTriggeredThread(
      {
        threadRepo: repo,
        activityLogRepo,
        memoryLoader,
        ...(options?.failureProducer ? { producer: options.failureProducer } : {}),
        logger,
        ...(options?.tracker ? { tracker: options.tracker } : {}),
      },
      { trigger: input.trigger, content: input.content, source: input.source }
    )
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

    // 5. linked_entities: one person ref derived from the mail's `from` address.
    //    ref_id is the lowercased email; extension_id matches the mail extension.
    expect(refreshed.linked_entities).toHaveLength(1)
    const personRef = refreshed.linked_entities[0]!
    expect(personRef.kind).toBe('person')
    expect(personRef.ref_id).toBe('fake@example.com')
    expect(personRef.extension_id).toBe(extensionId)
    expect(personRef.snapshot).toBeDefined()
    expect(personRef.snapshot.display).toBeTruthy()
    expect(personRef.snapshot.excerpt).toBeTruthy()
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

// ─── Failure-framing tests ────────────────────────────────────────────────────

describe('applyFailureFraming', () => {
  let dbPath: string

  beforeEach(() => {
    closeDb()
    resetDatabaseForTests()

    dbPath = path.join(
      os.tmpdir(),
      `stina-failframe-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
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
  })

  afterEach(() => {
    closeDb()
    resetDatabaseForTests()
    if (fs.existsSync(dbPath)) {
      try {
        fs.unlinkSync(dbPath)
      } catch {
        // ignore
      }
    }
  })

  it('applyFailureFraming marks first turn complete after framing append succeeds', async () => {
    const rawDb = getDatabase()
    const threadRepo = new ThreadRepository(asThreadsDb(rawDb))
    const activityLogRepo = new ActivityLogRepository(asAutonomyDb(rawDb))
    const logger = createConsoleLogger('error')

    const thread = await threadRepo.create({
      trigger: { kind: 'mail', extension_id: 'ext', mail_id: 'x' },
      title: 'Gate test',
    })

    // Precondition: pending before framing
    expect((await threadRepo.getById(thread.id))!.first_turn_completed_at).toBeNull()

    await applyFailureFraming(
      { threadRepo, activityLogRepo, logger },
      { thread_id: thread.id, error: new Error('turn failed') }
    )

    // Gate lifts after framing
    const after = await threadRepo.getById(thread.id)
    expect(after!.first_turn_completed_at).not.toBeNull()
  })

  it('applyFailureFraming does NOT mark first turn complete when framing append throws', async () => {
    const rawDb = getDatabase()
    const activityLogRepo = new ActivityLogRepository(asAutonomyDb(rawDb))
    const realThreadRepo = new ThreadRepository(asThreadsDb(rawDb))
    const logger = createConsoleLogger('error')

    const thread = await realThreadRepo.create({
      trigger: { kind: 'mail', extension_id: 'ext', mail_id: 'y' },
      title: 'Gate stays closed',
    })

    const markFirstTurnCompletedSpy = vi.fn()
    const mockThreadRepo = {
      appendMessage: vi.fn().mockImplementation((input: { content: { kind: string } }) => {
        if (input.content.kind === 'system') {
          return Promise.reject(new Error('DB write failed'))
        }
        return realThreadRepo.appendMessage(input as Parameters<typeof realThreadRepo.appendMessage>[0])
      }),
      markSurfaced: vi.fn().mockResolvedValue(undefined),
      markFirstTurnCompleted: markFirstTurnCompletedSpy,
    } as unknown as ThreadRepository

    await applyFailureFraming(
      { threadRepo: mockThreadRepo, activityLogRepo, logger },
      { thread_id: thread.id, error: new Error('turn failed') }
    )

    // Gate must NOT have been called — framing append failed
    expect(markFirstTurnCompletedSpy).not.toHaveBeenCalled()

    // Activity log still written
    const entries = await activityLogRepo.list({ thread_id: thread.id, kind: 'event_handled' })
    expect(entries.length).toBe(1)
  })

  it('producer throws → framing AppMessage appended + event_handled entry written with failure:true', async () => {
    const extensionId = 'stina-ext-mail-test'
    const mail_id = 'fail-mail-001'
    const runTurnMock = vi.fn().mockRejectedValue(new TypeError('model not available'))
    const throwingProducer: DecisionTurnProducer = runTurnMock

    const ctx = await buildTestApp({ failureProducer: throwingProducer })
    const { thread_id } = await ctx.emitThreadEvent({
      trigger: { kind: 'mail', extension_id: extensionId, mail_id },
      content: {
        kind: 'mail',
        from: 'test@example.com',
        subject: 'Failure test mail',
        snippet: 'snippet',
        mail_id,
      },
      source: { extension_id: extensionId },
    })

    // producer was called exactly once (no auto-retry)
    expect(runTurnMock).toHaveBeenCalledTimes(1)

    const rawDb = getDatabase()
    const threadRepo = new ThreadRepository(asThreadsDb(rawDb))
    const activityLogRepo = new ActivityLogRepository(asAutonomyDb(rawDb))

    // Thread is in GET /threads
    const app = ctx.app
    const threadsRes = await app.inject({ method: 'GET', url: '/threads' })
    expect(threadsRes.statusCode).toBe(200)
    const threads = (threadsRes.json() as Thread[])
    expect(threads.find((t) => t.id === thread_id)).toBeDefined()

    // Messages: original mail AppMessage + system framing message
    const messagesRes = await app.inject({ method: 'GET', url: `/threads/${thread_id}/messages` })
    const messages = messagesRes.json() as Message[]

    const appMessages = messages.filter((m) => m.author === 'app')
    expect(appMessages.length).toBe(2)

    const mailMsg = appMessages.find((m) => m.author === 'app' && (m as import('@stina/core').AppMessage).content.kind === 'mail')
    expect(mailMsg).toBeDefined()

    const systemMsg = appMessages.find(
      (m) => m.author === 'app' && (m as import('@stina/core').AppMessage).content.kind === 'system'
    ) as import('@stina/core').AppMessage | undefined
    expect(systemMsg).toBeDefined()
    expect(systemMsg!.source.extension_id).toBe(RUNTIME_EXTENSION_ID)
    expect((systemMsg!.content as { kind: string; message: string }).message).toBe(
      'Jag kunde inte bearbeta denna händelse automatiskt — granska gärna.'
    )

    // Activity log: exactly one event_handled entry with failure:true
    const entries = await activityLogRepo.list({ thread_id, kind: 'event_handled' })
    expect(entries.length).toBe(1)
    expect(entries[0]!.details['failure']).toBe(true)
    expect(typeof entries[0]!.details['error_message']).toBe('string')
    expect((entries[0]!.details['error_message'] as string).length).toBeGreaterThan(0)
    expect(entries[0]!.details['error_class']).toBe('TypeError')

    // Thread surfaced (system framing message has visibility:'normal')
    const threadRes = await app.inject({ method: 'GET', url: `/threads/${thread_id}` })
    const refreshed = threadRes.json() as Thread
    expect(refreshed.surfaced_at).not.toBeNull()

    await teardownApp(app, ctx.dbPath)
  })

  it('malformed producer output (ClosingActionMalformedError) → system framing message + error_class in activity log + gate lifted', async () => {
    const extensionId = 'stina-ext-mail-test'
    const mail_id = 'malformed-mail-001'

    // Producer that returns a normal-visibility reply with no content — triggers ClosingActionMalformedError.
    const malformedProducer: DecisionTurnProducer = async () => ({
      visibility: 'normal',
      content: { text: '' },
    })

    const ctx = await buildTestApp({ failureProducer: malformedProducer })
    const { thread_id } = await ctx.emitThreadEvent({
      trigger: { kind: 'mail', extension_id: extensionId, mail_id },
      content: {
        kind: 'mail',
        from: 'malform@example.com',
        subject: 'Malformed output test',
        snippet: 'snippet',
        mail_id,
      },
      source: { extension_id: extensionId },
    })

    const rawDb = getDatabase()
    const threadRepo = new ThreadRepository(asThreadsDb(rawDb))
    const activityLogRepo = new ActivityLogRepository(asAutonomyDb(rawDb))

    // Thread visible in GET /threads (gate lifted via applyFailureFraming)
    const app = ctx.app
    const threadsRes = await app.inject({ method: 'GET', url: '/threads' })
    expect(threadsRes.statusCode).toBe(200)
    const threads = threadsRes.json() as Thread[]
    expect(threads.find((t) => t.id === thread_id)).toBeDefined()

    // Messages: original AppMessage + system framing message (no Stina reply)
    const messagesRes = await app.inject({ method: 'GET', url: `/threads/${thread_id}/messages` })
    const messages = messagesRes.json() as Message[]

    const systemMsg = messages.find(
      (m) => m.author === 'app' && (m as import('@stina/core').AppMessage).content.kind === 'system'
    ) as import('@stina/core').AppMessage | undefined
    expect(systemMsg).toBeDefined()
    expect(systemMsg!.source.extension_id).toBe(RUNTIME_EXTENSION_ID)

    // Activity log has error_class === 'ClosingActionMalformedError'
    const entries = await activityLogRepo.list({ thread_id, kind: 'event_handled' })
    expect(entries.length).toBe(1)
    expect(entries[0]!.details['failure']).toBe(true)
    expect(entries[0]!.details['error_class']).toBe('ClosingActionMalformedError')
    expect((entries[0]!.details['error_message'] as string)).toMatch(/normal_message_empty_content/)

    // Gate is lifted (first_turn_completed_at set)
    const threadRow = await threadRepo.getById(thread_id)
    expect(threadRow!.first_turn_completed_at).not.toBeNull()

    // Thread is surfaced (system framing message has visibility:'normal')
    const threadRes = await app.inject({ method: 'GET', url: `/threads/${thread_id}` })
    const refreshed = threadRes.json() as Thread
    expect(refreshed.surfaced_at).not.toBeNull()

    await teardownApp(app, ctx.dbPath)
  })

  it('framing-append throws → activity log still written, applyFailureFraming resolves', async () => {
    const rawDb = getDatabase()
    const activityLogRepo = new ActivityLogRepository(asAutonomyDb(rawDb))

    // Create a real thread so we have a valid thread_id
    const realThreadRepo = new ThreadRepository(asThreadsDb(rawDb))
    const thread = await realThreadRepo.create({
      trigger: { kind: 'mail', extension_id: 'ext', mail_id: 'x' },
      title: 'Test thread',
    })

    // Mock threadRepo.appendMessage to reject on system content but allow others
    const mockThreadRepo = {
      appendMessage: vi.fn().mockImplementation((input: { content: { kind: string } }) => {
        if (input.content.kind === 'system') {
          return Promise.reject(new Error('DB write failed'))
        }
        return realThreadRepo.appendMessage(input as Parameters<typeof realThreadRepo.appendMessage>[0])
      }),
      // Robust against try-block ordering changes in applyFailureFraming
      markSurfaced: vi.fn().mockResolvedValue(undefined),
    } as unknown as ThreadRepository

    const logger = createConsoleLogger('error')

    // Should resolve without throwing even though appendMessage rejects for system
    await expect(
      applyFailureFraming(
        { threadRepo: mockThreadRepo, activityLogRepo, logger },
        { thread_id: thread.id, error: new Error('turn failed') }
      )
    ).resolves.toBeDefined()

    // Activity log entry must still be present
    const entries = await activityLogRepo.list({ thread_id: thread.id, kind: 'event_handled' })
    expect(entries.length).toBe(1)
    expect(entries[0]!.details['failure']).toBe(true)
  })
})

// ─── Degraded mode E2E tests ──────────────────────────────────────────────────

describe('applyFailureFraming — degraded mode E2E', () => {
  let dbPath: string

  beforeEach(() => {
    closeDb()
    resetDatabaseForTests()

    dbPath = path.join(
      os.tmpdir(),
      `stina-degraded-e2e-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
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
  })

  afterEach(() => {
    closeDb()
    resetDatabaseForTests()
    if (fs.existsSync(dbPath)) {
      try {
        fs.unlinkSync(dbPath)
      } catch {
        // ignore
      }
    }
  })

  it('E2E entry: 5 mail events that all fail with TypeError → 5 threads created; anchor thread (5th) has degraded_mode_entered AppMessage', async () => {
    const tracker = new DegradedModeTracker()
    const throwingProducer: DecisionTurnProducer = vi.fn().mockRejectedValue(new TypeError('model unavailable'))

    const ctx = await buildTestApp({ failureProducer: throwingProducer, tracker })
    const threadIds: string[] = []

    for (let i = 0; i < DEGRADED_MODE_FAILURE_THRESHOLD; i++) {
      const { thread_id } = await ctx.emitThreadEvent({
        trigger: { kind: 'mail', extension_id: 'stina-ext-mail', mail_id: `mail-e2e-${i}` },
        content: {
          kind: 'mail',
          from: `user${i}@example.com`,
          subject: `Test mail ${i}`,
          snippet: 'snippet',
          mail_id: `mail-e2e-${i}`,
        },
        source: { extension_id: 'stina-ext-mail' },
      })
      threadIds.push(thread_id)
    }

    expect(tracker.isInDegraded()).toBe(true)
    const anchorThreadId = threadIds[DEGRADED_MODE_FAILURE_THRESHOLD - 1]! // 5th thread

    const rawDb = getDatabase()
    const threadRepo = new ThreadRepository(asThreadsDb(rawDb))

    // Anchor thread (5th) has degraded_mode_entered AppMessage
    const anchorMessages = await threadRepo.listMessages(anchorThreadId)
    const appMessages = anchorMessages.filter((m) => m.author === 'app') as AppMessage[]

    const statusMsg = appMessages.find(
      (m) => m.content.kind === 'extension_status' &&
        (m.content as { kind: string; status: string }).status === 'degraded_mode_entered'
    ) as AppMessage | undefined
    expect(statusMsg).toBeDefined()
    if (statusMsg && statusMsg.content.kind === 'extension_status') {
      expect(statusMsg.content.status).toBe('degraded_mode_entered')
      expect(statusMsg.content.extension_id).toBe(RUNTIME_EXTENSION_ID)
      expect(statusMsg.content.detail).toContain('Stina har problem att bearbeta händelser')
    }

    // Threads 1–4 should NOT have a degraded_mode_entered message
    for (let i = 0; i < DEGRADED_MODE_FAILURE_THRESHOLD - 1; i++) {
      const msgs = await threadRepo.listMessages(threadIds[i]!)
      const hasStatusMsg = (msgs.filter((m) => m.author === 'app') as AppMessage[]).some(
        (m) => m.content.kind === 'extension_status'
      )
      expect(hasStatusMsg).toBe(false)
    }

    await teardownApp(ctx.app, ctx.dbPath)
  })

  it('E2E exit: 5 fails then 6th succeeds → 6th thread success writes degraded_mode_exited on anchor (5th thread) with aggregated_count===5', async () => {
    const tracker = new DegradedModeTracker()

    // Use a mutable producer reference so we can switch from failing to succeeding
    // within a single app instance (same DB).
    let shouldFail = true
    const mutableProducer: DecisionTurnProducer = vi.fn().mockImplementation(() => {
      if (shouldFail) {
        return Promise.reject(new TypeError('model unavailable'))
      }
      // Return a valid silent output for success (silent avoids empty-content ClosingActionMalformedError)
      return Promise.resolve({ visibility: 'silent' as const, content: { text: 'ok' } })
    })

    const ctx = await buildTestApp({ failureProducer: mutableProducer, tracker })
    const threadIds: string[] = []

    // 5 failing events
    for (let i = 0; i < DEGRADED_MODE_FAILURE_THRESHOLD; i++) {
      const { thread_id } = await ctx.emitThreadEvent({
        trigger: { kind: 'mail', extension_id: 'stina-ext-mail', mail_id: `fail-${i}` },
        content: {
          kind: 'mail',
          from: `fail${i}@example.com`,
          subject: `Fail mail ${i}`,
          snippet: 'snippet',
          mail_id: `fail-${i}`,
        },
        source: { extension_id: 'stina-ext-mail' },
      })
      threadIds.push(thread_id)
    }

    expect(tracker.isInDegraded()).toBe(true)
    const anchorThreadId = threadIds[DEGRADED_MODE_FAILURE_THRESHOLD - 1]!

    // Switch to success and emit 6th event
    shouldFail = false
    await ctx.emitThreadEvent({
      trigger: { kind: 'mail', extension_id: 'stina-ext-mail', mail_id: 'success-mail' },
      content: {
        kind: 'mail',
        from: 'success@example.com',
        subject: 'Success mail',
        snippet: 'snippet',
        mail_id: 'success-mail',
      },
      source: { extension_id: 'stina-ext-mail' },
    })

    expect(tracker.isInDegraded()).toBe(false)

    const rawDb = getDatabase()
    const threadRepo = new ThreadRepository(asThreadsDb(rawDb))

    // Anchor thread (5th) should now have degraded_mode_exited AppMessage
    const anchorMessages = await threadRepo.listMessages(anchorThreadId)
    const appMessages = anchorMessages.filter((m) => m.author === 'app') as AppMessage[]

    const exitMsg = appMessages.find(
      (m) => m.content.kind === 'extension_status' &&
        (m.content as { kind: string; status: string }).status === 'degraded_mode_exited'
    ) as AppMessage | undefined
    expect(exitMsg).toBeDefined()
    if (exitMsg && exitMsg.content.kind === 'extension_status') {
      expect(exitMsg.content.status).toBe('degraded_mode_exited')
      expect(exitMsg.content.detail).toContain('Återhämtning')
      expect(exitMsg.content.detail).toContain(String(DEGRADED_MODE_FAILURE_THRESHOLD))
    }

    await teardownApp(ctx.app, ctx.dbPath)
  })
})
