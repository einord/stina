/**
 * Integration test: scheduler emit-shorthand path (§04 lines 168–176)
 *
 * Schedules a job with `emit: { description }`, advances a fake clock past the
 * trigger time, ticks the scheduler, and asserts that a `kind: 'scheduled'`
 * thread was spawned. Key assertions:
 *   - AppMessage source.extension_id === RUNTIME_EXTENSION_ID (runtime is emitter)
 *   - content.kind === 'scheduled', content.description matches
 *   - extensionHost.notifySchedulerFire was NOT called (legacy path bypassed)
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
import { spawnTriggeredThread, DefaultMemoryContextLoader } from '@stina/orchestrator'
import { asThreadsDb, asMemoryDb, asAutonomyDb } from '../asRedesign2026Db.js'
import { threadRoutes } from '../routes/threads.js'
import { RUNTIME_EXTENSION_ID } from '@stina/core'
import type { Thread, Message } from '@stina/core'
import type { AppMessage } from '@stina/core'
import type { ThreadTrigger, AppContent } from '@stina/core'
import { SchedulerService, getSchedulerMigrationsPath, type SchedulerDb } from '@stina/scheduler'

// ─── Test app builder ──────────────────────────────────────────────────────────

async function buildTestApp(): Promise<{
  app: FastifyInstance
  dbPath: string
  scheduler: SchedulerService
  notifySchedulerFireMock: ReturnType<typeof vi.fn>
}> {
  closeDb()
  resetDatabaseForTests()

  const dbPath = path.join(
    os.tmpdir(),
    `stina-scheduledemit-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
  )
  const logger = createConsoleLogger('error')

  // Initialize the shared DB with all migrations including scheduler tables.
  // In production, server.ts uses a single DB for all packages; tests mirror this.
  initDatabase({
    logger,
    dbPath,
    migrations: [
      getChatMigrationsPath(),
      getSchedulerMigrationsPath(),
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

  // Mirrors the production `emitEventInternal` wrapper exposed from
  // apps/api/src/server.ts: accepts an optional source on the input and
  // defaults its extension_id to RUNTIME_EXTENSION_ID when absent. The
  // scheduler's onFire handler in production calls this WITHOUT a source
  // field, so the default kicks in and the spawned AppMessage carries
  // RUNTIME_EXTENSION_ID. If a future regression passes source explicitly,
  // the assertion in the test below catches it.
  const emitEventInternal = async (input: {
    trigger: ThreadTrigger
    content: AppContent
    source?: { extension_id?: string; component?: string }
  }): Promise<{ thread_id: string }> => {
    const rawDb = getDatabase()
    const repo = new ThreadRepository(asThreadsDb(rawDb))
    const memoryLoader = new DefaultMemoryContextLoader(
      new StandingInstructionRepository(asMemoryDb(rawDb)),
      new ProfileFactRepository(asMemoryDb(rawDb))
    )
    const activityLogRepo = new ActivityLogRepository(asAutonomyDb(rawDb))

    return spawnTriggeredThread(
      { threadRepo: repo, activityLogRepo, memoryLoader, logger },
      {
        trigger: input.trigger,
        content: input.content,
        source: {
          extension_id: input.source?.extension_id ?? RUNTIME_EXTENSION_ID,
          ...(input.source?.component ? { component: input.source.component } : {}),
        },
      }
    )
  }

  const notifySchedulerFireMock = vi.fn()

  // Use the shared DB for the scheduler (cast is safe: both are BetterSQLite3Database).
  const sharedDb = getDatabase() as unknown as SchedulerDb

  const scheduler = new SchedulerService({
    db: sharedDb,
    logger,
    onFire: (event) => {
      if (event.emit) {
        // Emit-shorthand path — mirrors apps/api/src/server.ts onFire handler
        void emitEventInternal({
          trigger: { kind: 'scheduled', job_id: event.payload.id },
          content: {
            kind: 'scheduled',
            job_id: event.payload.id,
            description: event.emit.description,
            ...(event.emit.payload ? { payload: event.emit.payload } : {}),
          },
        }).catch((err) => {
          logger.warn('scheduler emitEvent failed', { error: String(err) })
        })
        return true
      }

      // Legacy path (should NOT be hit for emit-shorthand jobs in this test)
      notifySchedulerFireMock(event.extensionId, event.payload)
      return true
    },
  })

  return { app, dbPath, scheduler, notifySchedulerFireMock }
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('scheduler emit-shorthand integration', () => {
  let app: FastifyInstance
  let dbPath: string
  let scheduler: SchedulerService
  let notifySchedulerFireMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.useFakeTimers()
    const ctx = await buildTestApp()
    app = ctx.app
    dbPath = ctx.dbPath
    scheduler = ctx.scheduler
    notifySchedulerFireMock = ctx.notifySchedulerFireMock
  })

  afterEach(async () => {
    scheduler.stop()
    await teardownApp(app, dbPath)
    vi.useRealTimers()
  })

  it('fires an emit-shorthand job: spawns a scheduled thread with source=RUNTIME_EXTENSION_ID; notifySchedulerFire not called', async () => {
    vi.setSystemTime(new Date('2025-06-01T07:00:00Z'))

    scheduler.start()
    scheduler.schedule('stina-ext-work', {
      id: 'morning-summary',
      schedule: { type: 'at', at: '2025-06-01T07:00:00Z' },
      userId: 'test-user',
      emit: { description: 'Test summary' },
    })

    // Tick the scheduler — job is already past-due
    await vi.runOnlyPendingTimersAsync()

    // Allow all async DB work kicked off by spawnTriggeredThread to settle
    await vi.runAllTimersAsync()

    // 1. A thread with trigger.kind === 'scheduled' was created
    const threadsRes = await app.inject({ method: 'GET', url: '/threads' })
    expect(threadsRes.statusCode).toBe(200)
    const threads = threadsRes.json() as Thread[]

    const scheduledThread = threads.find((t) => t.trigger.kind === 'scheduled')
    expect(scheduledThread).toBeDefined()

    // 2. Thread trigger has the correct job_id
    if (scheduledThread) {
      expect((scheduledThread.trigger as { kind: string; job_id: string }).job_id).toBe(
        'morning-summary'
      )
    }

    // 3. The AppMessage has source.extension_id === RUNTIME_EXTENSION_ID.
    //    The runtime is the emitter; the scheduling extension is the configurator.
    //    (§04 critical accuracy point: source is intentionally not the extension id)
    if (scheduledThread) {
      const messagesRes = await app.inject({
        method: 'GET',
        url: `/threads/${scheduledThread.id}/messages`,
      })
      expect(messagesRes.statusCode).toBe(200)
      const messages = messagesRes.json() as Message[]

      const appMsg = messages.find((m) => m.author === 'app') as AppMessage | undefined
      expect(appMsg).toBeDefined()
      if (appMsg) {
        expect(appMsg.source.extension_id).toBe(RUNTIME_EXTENSION_ID)
        const content = appMsg.content as { kind: string; description?: string }
        expect(content.kind).toBe('scheduled')
        expect(content.description).toBe('Test summary')
      }
    }

    // 4. notifySchedulerFire was NOT called (emit-shorthand bypasses legacy path)
    expect(notifySchedulerFireMock).not.toHaveBeenCalled()
  })
})
