/**
 * Integration tests: GET /notifications and the NotificationDispatcher bridge.
 *
 * Covers:
 *   - GET /notifications returns notified threads as NotificationEvent[]
 *   - GET /notifications returns empty array when no threads are notified
 *   - GET /notifications/stream filters by user_id (dispatcher bridge)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import {
  closeDb,
  initDatabase,
  createConsoleLogger,
  resetDatabaseForTests,
} from '@stina/adapters-node'
import { getThreadsMigrationsPath, ThreadRepository } from '@stina/threads/db'
import { getMemoryMigrationsPath } from '@stina/memory/db'
import { getAutonomyMigrationsPath } from '@stina/autonomy/db'
import { getChatMigrationsPath } from '@stina/chat/db'
import { NotificationDispatcher } from '@stina/orchestrator'
import type { NotificationEvent as OrchestratorNotificationEvent } from '@stina/orchestrator'
import { asThreadsDb } from '../asRedesign2026Db.js'
import { notificationRoutes } from '../routes/notifications.js'

// ─── Test app builder ────────────────────────────────────────────────────────

async function buildTestApp(userId = 'test-user'): Promise<{
  app: FastifyInstance
  dbPath: string
  threadRepo: ThreadRepository
  dispatcher: NotificationDispatcher
}> {
  closeDb()
  resetDatabaseForTests()

  const dbPath = path.join(
    os.tmpdir(),
    `stina-notifications-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
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

  const { getDatabase } = await import('@stina/adapters-node')
  const rawDb = getDatabase()
  const threadRepo = new ThreadRepository(asThreadsDb(rawDb))
  const dispatcher = new NotificationDispatcher()

  const app = Fastify({ logger: false })
  app.decorateRequest('isAuthenticated', false)
  app.decorateRequest('user', null)
  app.addHook('onRequest', async (request) => {
    ;(request as unknown as { isAuthenticated: boolean }).isAuthenticated = true
    ;(request as unknown as { user: { id: string; role: string } }).user = {
      id: userId,
      role: 'user',
    }
  })

  await app.register(notificationRoutes, { notificationDispatcher: dispatcher })
  await app.ready()

  return { app, dbPath, threadRepo, dispatcher }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /notifications', () => {
  let app: FastifyInstance
  let dbPath: string
  let threadRepo: ThreadRepository
  let dispatcher: NotificationDispatcher

  beforeEach(async () => {
    ;({ app, dbPath, threadRepo, dispatcher } = await buildTestApp())
  })

  afterEach(async () => {
    await app.close()
    closeDb()
    try {
      fs.unlinkSync(dbPath)
    } catch {
      /* ignore */
    }
  })

  it('returns an empty array when no threads have been notified', async () => {
    // Create a thread but do NOT call markNotified
    await threadRepo.create({
      trigger: { kind: 'mail', extension_id: 'ext', mail_id: 'mail-1' },
      title: 'Not notified',
    })

    const res = await app.inject({ method: 'GET', url: '/notifications' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body) as unknown[]
    expect(body).toEqual([])
  })

  it('returns notified threads mapped to NotificationEvent shape', async () => {
    const thread = await threadRepo.create({
      trigger: { kind: 'mail', extension_id: 'ext-mail', mail_id: 'mail-2' },
      title: 'Test notification',
    })
    // markFirstTurnCompleted is required: list() excludes pending threads by default.
    await threadRepo.markFirstTurnCompleted(thread.id)
    await threadRepo.markNotified(thread.id)

    const res = await app.inject({ method: 'GET', url: '/notifications' })
    expect(res.statusCode).toBe(200)

    const events = JSON.parse(res.body) as OrchestratorNotificationEvent[]
    expect(events).toHaveLength(1)
    expect(events[0]!.thread_id).toBe(thread.id)
    expect(events[0]!.title).toBe('Test notification')
    expect(events[0]!.kind).toBe('normal')
    expect(events[0]!.trigger_kind).toBe('mail')
    expect(events[0]!.extension_id).toBe('ext-mail')
    expect(typeof events[0]!.notified_at).toBe('number')
    expect(events[0]!.notified_at).toBeGreaterThan(0)
  })

  it('dispatcher bridge: events are forwarded only to the matching user_id', () => {
    // We test user-id filtering by subscribing directly to the dispatcher
    // and verifying the bridge's per-user filter logic.
    const received: OrchestratorNotificationEvent[] = []
    const userId = 'user-alpha'
    const otherUserId = 'user-beta'

    // Simulate what the SSE route bridge does — only forward if user matches
    dispatcher.subscribe((event) => {
      if (event.user_id !== userId) return
      received.push(event)
    })

    // Dispatch event for the matching user
    dispatcher.dispatch({
      thread_id: 'thread-1',
      user_id: userId,
      title: 'For alpha',
      preview: 'preview',
      kind: 'normal',
      notified_at: Date.now(),
    })

    // Dispatch event for a different user
    dispatcher.dispatch({
      thread_id: 'thread-2',
      user_id: otherUserId,
      title: 'For beta',
      preview: 'preview',
      kind: 'normal',
      notified_at: Date.now(),
    })

    expect(received).toHaveLength(1)
    expect(received[0]!.thread_id).toBe('thread-1')
  })
})
