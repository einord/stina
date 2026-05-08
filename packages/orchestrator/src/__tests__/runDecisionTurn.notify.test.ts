/**
 * Unit tests for runDecisionTurn — notification dispatch behaviour (§04 Phase 8j).
 *
 * Covers:
 *   - notifyOnSurface:true + dispatcher → dispatches notification on first turn
 *   - monotonic guard: second call with same thread → markNotified returns false → no second dispatch
 *   - notifyOnSurface:false (default) → no notification even with dispatcher present
 *   - no dispatcher → no notification even with notifyOnSurface:true
 *   - notification includes correct thread_id, kind, preview from Stina's reply
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ThreadRepository, threadsSchema } from '@stina/threads/db'
import { runDecisionTurn } from '../runDecisionTurn.js'
import { NotificationDispatcher } from '../notificationDispatcher.js'
import type { NotificationEvent } from '../notificationDispatcher.js'
import type { DecisionTurnProducer } from '../producers/canned.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function createTestDb(): BetterSQLite3Database<typeof threadsSchema> {
  const sqlite = new Database(':memory:')
  const migrationsDir = path.join(__dirname, '..', '..', '..', 'threads', 'src', 'db', 'migrations')
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of migrationFiles) {
    sqlite.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf-8'))
  }
  return drizzle(sqlite, { schema: threadsSchema })
}

const normalProducer: DecisionTurnProducer = async () => ({
  visibility: 'normal',
  content: { text: 'Hej, här är ett svar från Stina.' },
})

describe('runDecisionTurn — notification dispatch', () => {
  let repo: ThreadRepository
  let dispatcher: NotificationDispatcher

  beforeEach(() => {
    const db = createTestDb()
    repo = new ThreadRepository(db)
    dispatcher = new NotificationDispatcher()
  })

  it('dispatches a notification when notifyOnSurface:true and dispatcher is set', async () => {
    const thread = await repo.create({
      trigger: { kind: 'mail', extension_id: 'ext-mail', mail_id: 'mail-1' },
      title: 'Nytt mail',
    })

    const received: NotificationEvent[] = []
    dispatcher.subscribe((e) => received.push(e))

    await runDecisionTurn({
      threadId: thread.id,
      threadRepo: repo,
      producer: normalProducer,
      notificationDispatcher: dispatcher,
      notifyOnSurface: true,
      notifyUserId: 'user-1',
    })

    expect(received).toHaveLength(1)
    const notif = received[0]!
    expect(notif.thread_id).toBe(thread.id)
    expect(notif.kind).toBe('normal')
    expect(notif.user_id).toBe('user-1')
    expect(notif.title).toBe('Nytt mail')
    expect(notif.preview).toBe('Hej, här är ett svar från Stina.')
  })

  it('does not dispatch a second notification on a follow-up turn (monotonic markNotified)', async () => {
    const thread = await repo.create({
      trigger: { kind: 'mail', extension_id: 'ext-mail', mail_id: 'mail-2' },
      title: 'Uppföljning',
    })

    const received: NotificationEvent[] = []
    dispatcher.subscribe((e) => received.push(e))

    // First turn — should notify
    await runDecisionTurn({
      threadId: thread.id,
      threadRepo: repo,
      producer: normalProducer,
      notificationDispatcher: dispatcher,
      notifyOnSurface: true,
      notifyUserId: 'user-1',
    })
    expect(received).toHaveLength(1)

    // Second turn on the same thread — markNotified returns false → no second dispatch
    await runDecisionTurn({
      threadId: thread.id,
      threadRepo: repo,
      producer: normalProducer,
      notificationDispatcher: dispatcher,
      notifyOnSurface: true,
      notifyUserId: 'user-1',
    })
    expect(received).toHaveLength(1)
  })

  it('does not dispatch when notifyOnSurface is false (default)', async () => {
    const thread = await repo.create({
      trigger: { kind: 'user' },
      title: 'Direktmeddelande',
    })

    const listener = vi.fn()
    dispatcher.subscribe(listener)

    await runDecisionTurn({
      threadId: thread.id,
      threadRepo: repo,
      producer: normalProducer,
      notificationDispatcher: dispatcher,
      // notifyOnSurface omitted → defaults to false
    })

    expect(listener).not.toHaveBeenCalled()
  })

  it('does not dispatch when no notificationDispatcher is provided', async () => {
    const thread = await repo.create({
      trigger: { kind: 'mail', extension_id: 'ext-mail', mail_id: 'mail-3' },
      title: 'Ingen dispatcher',
    })

    const listener = vi.fn()
    dispatcher.subscribe(listener)

    // No dispatcher provided, even though notifyOnSurface is true
    await runDecisionTurn({
      threadId: thread.id,
      threadRepo: repo,
      producer: normalProducer,
      notifyOnSurface: true,
    })

    // listener was subscribed to a separate dispatcher object — nothing routed to it
    expect(listener).not.toHaveBeenCalled()
  })

  it('sets trigger_kind and extension_id from the thread trigger', async () => {
    const thread = await repo.create({
      trigger: { kind: 'calendar', extension_id: 'ext-calendar', event_id: 'cal-1' },
      title: 'Kalenderhändelse',
    })

    const received: NotificationEvent[] = []
    dispatcher.subscribe((e) => received.push(e))

    await runDecisionTurn({
      threadId: thread.id,
      threadRepo: repo,
      producer: normalProducer,
      notificationDispatcher: dispatcher,
      notifyOnSurface: true,
      notifyUserId: 'user-2',
    })

    expect(received).toHaveLength(1)
    const notif = received[0]!
    expect(notif.trigger_kind).toBe('calendar')
    expect(notif.extension_id).toBe('ext-calendar')
  })
})
