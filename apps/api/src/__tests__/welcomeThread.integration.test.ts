/**
 * Integration test: welcome thread on first boot (§04 "post-upgrade welcome
 * thread" use case, Step 8l).
 *
 * Does NOT boot the full Fastify server. Builds a synthetic `emitEventInternal`
 * that mirrors the production wrapper (calls `spawnTriggeredThread` with real
 * repos + the canned-stub producer). Follows the Phase 8j / 8k integration
 * test pattern.
 *
 * Assertions:
 *   a) Thread with trigger.kind === 'stina', trigger.reason === 'system_notice',
 *      title === 'Välkommen till Stina' exists.
 *   b) The AppMessage has content.kind === 'system' with the expected message text.
 *   c) The marker 'welcome_thread_v1' exists for the user.
 *   d) The notification dispatcher received one event (welcome lands in bell badge).
 *   e) Second call returns { spawned: false }, no new thread, marker count unchanged.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
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
import {
  getAutonomyMigrationsPath,
  ActivityLogRepository,
  RuntimeMarkersRepository,
} from '@stina/autonomy/db'
import { getChatMigrationsPath } from '@stina/chat/db'
import {
  spawnTriggeredThread,
  DefaultMemoryContextLoader,
  NotificationDispatcher,
  spawnWelcomeThreadIfNew,
  WELCOME_MESSAGE_TEXT,
} from '@stina/orchestrator'
import { asThreadsDb, asMemoryDb, asAutonomyDb } from '../asRedesign2026Db.js'
import { RUNTIME_EXTENSION_ID } from '@stina/core'
import type { AppMessage, ThreadTrigger, AppContent } from '@stina/core'

// ─── Test context builder ────────────────────────────────────────────────────

const TEST_USER_ID = 'integration-test-user-1'

interface TestContext {
  dbPath: string
  threadRepo: ThreadRepository
  markersRepo: RuntimeMarkersRepository
  notificationDispatcher: NotificationDispatcher
  emitEventInternal: (input: {
    trigger: ThreadTrigger
    content: AppContent
    source?: { extension_id?: string; component?: string }
    title?: string
  }) => Promise<{ thread_id: string }>
}

async function buildTestContext(): Promise<TestContext> {
  closeDb()
  resetDatabaseForTests()

  const dbPath = path.join(
    os.tmpdir(),
    `stina-welcome-integration-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
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

  const notificationDispatcher = new NotificationDispatcher()

  // Synthetic emitEventInternal — mirrors the production wrapper with real repos
  // + canned-stub producer (no provider configured). Passes notificationDispatcher
  // so we can assert the welcome lands in the bell badge.
  const emitEventInternal = async (input: {
    trigger: ThreadTrigger
    content: AppContent
    source?: { extension_id?: string; component?: string }
    title?: string
  }): Promise<{ thread_id: string }> => {
    const rawDb = getDatabase()
    const repo = new ThreadRepository(asThreadsDb(rawDb))
    const memoryLoader = new DefaultMemoryContextLoader(
      new StandingInstructionRepository(asMemoryDb(rawDb)),
      new ProfileFactRepository(asMemoryDb(rawDb))
    )
    const activityLogRepo = new ActivityLogRepository(asAutonomyDb(rawDb))

    const source = {
      extension_id: input.source?.extension_id ?? RUNTIME_EXTENSION_ID,
      ...(input.source?.component ? { component: input.source.component } : {}),
    }

    return spawnTriggeredThread(
      {
        threadRepo: repo,
        activityLogRepo,
        memoryLoader,
        logger,
        notificationDispatcher,
        notifyUserId: TEST_USER_ID,
      },
      {
        trigger: input.trigger,
        content: input.content,
        source,
        ...(input.title !== undefined ? { title: input.title } : {}),
      }
    )
  }

  const rawDb = getDatabase()
  const threadRepo = new ThreadRepository(asThreadsDb(rawDb))
  const markersRepo = new RuntimeMarkersRepository(asAutonomyDb(rawDb))

  return { dbPath, threadRepo, markersRepo, notificationDispatcher, emitEventInternal }
}

function teardownTestContext(dbPath: string): void {
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

describe('welcome thread integration', () => {
  let ctx: TestContext

  beforeEach(async () => {
    ctx = await buildTestContext()
  })

  afterEach(() => {
    teardownTestContext(ctx.dbPath)
  })

  it('spawns a welcome thread and notifies on first boot; second call is a no-op', async () => {
    const { markersRepo, emitEventInternal, notificationDispatcher, threadRepo } = ctx
    const logger = createConsoleLogger('error')

    // Track dispatched notifications
    const receivedEvents: import('@stina/orchestrator').NotificationEvent[] = []
    const unsub = notificationDispatcher.subscribe((event) => {
      receivedEvents.push(event)
    })

    // ─── First call ──────────────────────────────────────────────────────────

    const firstResult = await spawnWelcomeThreadIfNew(
      { markersRepo, emitEventInternal, logger },
      { userId: TEST_USER_ID }
    )

    expect(firstResult.spawned).toBe(true)
    expect(firstResult.thread_id).toBeTruthy()
    const thread_id = firstResult.thread_id!

    // (a) Thread has correct trigger and title
    const rawDb = getDatabase()
    const freshRepo = new ThreadRepository(asThreadsDb(rawDb))
    const thread = await freshRepo.getById(thread_id)
    expect(thread).not.toBeNull()
    expect(thread!.trigger.kind).toBe('stina')
    expect((thread!.trigger as { kind: 'stina'; reason: string }).reason).toBe('system_notice')
    expect(thread!.title).toBe('Välkommen till Stina')

    // (b) AppMessage has content.kind === 'system' with expected message text
    const messages = await freshRepo.listMessages(thread_id)
    const appMsg = messages.find((m) => m.author === 'app') as AppMessage | undefined
    expect(appMsg).toBeDefined()
    expect(appMsg!.content.kind).toBe('system')
    expect((appMsg!.content as { kind: string; message: string }).message).toBe(WELCOME_MESSAGE_TEXT)
    // Source defaults to RUNTIME_EXTENSION_ID because the helper omits the
    // source field. Load-bearing for §02 audit semantics: a future regression
    // that passes a real extension_id would impersonate; this assertion catches it.
    expect(appMsg!.source.extension_id).toBe(RUNTIME_EXTENSION_ID)

    // (c) Marker exists for this user
    expect(await markersRepo.has('welcome_thread_v1', TEST_USER_ID)).toBe(true)

    // (d) Notification dispatcher received one event (welcome lands in bell badge)
    expect(receivedEvents).toHaveLength(1)
    expect(receivedEvents[0]!.thread_id).toBe(thread_id)
    expect(receivedEvents[0]!.user_id).toBe(TEST_USER_ID)
    expect(receivedEvents[0]!.title).toBe('Välkommen till Stina')

    // ─── Second call (idempotency) ────────────────────────────────────────────

    const secondResult = await spawnWelcomeThreadIfNew(
      { markersRepo, emitEventInternal, logger },
      { userId: TEST_USER_ID }
    )

    expect(secondResult.spawned).toBe(false)
    expect(secondResult.thread_id).toBeUndefined()

    // No new notification dispatched
    expect(receivedEvents).toHaveLength(1)

    // Marker still set (count unchanged)
    expect(await markersRepo.has('welcome_thread_v1', TEST_USER_ID)).toBe(true)

    // Thread count is still 1 in the inbox
    const threads = await threadRepo.list({ limit: 50 })
    expect(threads.filter((t) => t.id === thread_id)).toHaveLength(1)

    unsub()
  })
})
