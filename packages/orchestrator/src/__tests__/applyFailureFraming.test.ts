/**
 * Unit tests for applyFailureFraming — degraded-mode integration (§04 Phase 8h).
 *
 * Covers:
 *   - 5 same-class failures → 5th call also writes entry extension_status AppMessage on anchor thread.
 *   - 6th failure while degraded → only per-failure system framing; no second extension_status.
 *   - Anchor-thread message append failure is swallowed (applyFailureFraming still resolves).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ThreadRepository, threadsSchema } from '@stina/threads/db'
import { ActivityLogRepository, autonomySchema } from '@stina/autonomy/db'
import { RUNTIME_EXTENSION_ID } from '@stina/core'
import type { AppMessage } from '@stina/core'
import { DegradedModeTracker } from '../degradedMode.js'
import { applyFailureFraming } from '../applyFailureFraming.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function createTestDbs(): {
  threadRepo: ThreadRepository
  activityLogRepo: ActivityLogRepository
} {
  const sqlite = new Database(':memory:')

  const apply = (relativePath: string) => {
    const migrationsDir = path.join(__dirname, '..', '..', '..', relativePath)
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
    for (const file of files) {
      sqlite.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf-8'))
    }
  }

  apply(path.join('threads', 'src', 'db', 'migrations'))
  apply(path.join('autonomy', 'src', 'db', 'migrations'))

  const threadDb = drizzle(sqlite, { schema: threadsSchema })
  const autonomyDb = drizzle(sqlite, { schema: autonomySchema })

  return {
    threadRepo: new ThreadRepository(threadDb),
    activityLogRepo: new ActivityLogRepository(autonomyDb),
  }
}

const noopLogger = { warn: vi.fn() }

describe('applyFailureFraming — degraded mode entry', () => {
  let threadRepo: ThreadRepository
  let activityLogRepo: ActivityLogRepository

  beforeEach(() => {
    const dbs = createTestDbs()
    threadRepo = dbs.threadRepo
    activityLogRepo = dbs.activityLogRepo
    noopLogger.warn.mockClear()
  })

  it('5 same-class failures → 5th call additionally writes extension_status:degraded_mode_entered on anchor thread', async () => {
    const tracker = new DegradedModeTracker()

    // Create 5 threads and apply failure framing to each
    const threadIds: string[] = []
    for (let i = 0; i < 5; i++) {
      const thread = await threadRepo.create({
        trigger: { kind: 'mail', extension_id: 'ext', mail_id: `mail-${i}` },
        title: `Thread ${i}`,
      })
      threadIds.push(thread.id)
    }

    // Apply failure framing for the first 4 (no entry yet)
    for (let i = 0; i < 4; i++) {
      const result = await applyFailureFraming(
        { threadRepo, activityLogRepo, logger: noopLogger, tracker },
        { thread_id: threadIds[i]!, error: new TypeError('fail') }
      )
      expect(result.suppressNotification).toBe(false)
    }

    // 5th failure — should trigger entry
    const result = await applyFailureFraming(
      { threadRepo, activityLogRepo, logger: noopLogger, tracker },
      { thread_id: threadIds[4]!, error: new TypeError('fail') }
    )
    expect(result.suppressNotification).toBe(true)
    expect(tracker.isInDegraded()).toBe(true)

    // The anchor thread (5th thread) should have TWO app messages:
    // 1. system framing message
    // 2. extension_status: degraded_mode_entered
    const messages = await threadRepo.listMessages(threadIds[4]!)
    const appMessages = messages.filter((m) => m.author === 'app') as AppMessage[]
    expect(appMessages.length).toBe(2)

    const statusMsg = appMessages.find(
      (m) => m.content.kind === 'extension_status'
    ) as AppMessage | undefined
    expect(statusMsg).toBeDefined()
    expect(statusMsg!.source.extension_id).toBe(RUNTIME_EXTENSION_ID)
    if (statusMsg && statusMsg.content.kind === 'extension_status') {
      expect(statusMsg.content.status).toBe('degraded_mode_entered')
      expect(statusMsg.content.extension_id).toBe(RUNTIME_EXTENSION_ID)
      expect(statusMsg.content.detail).toContain('Stina har problem att bearbeta händelser')
      expect(statusMsg.content.detail).toContain('5')
    }
  })

  it('6th failure while degraded → only system framing message; no additional extension_status', async () => {
    const tracker = new DegradedModeTracker()

    const threadIds: string[] = []
    for (let i = 0; i < 6; i++) {
      const thread = await threadRepo.create({
        trigger: { kind: 'mail', extension_id: 'ext', mail_id: `mail-${i}` },
        title: `Thread ${i}`,
      })
      threadIds.push(thread.id)
    }

    // Enter degraded mode (5 failures)
    for (let i = 0; i < 5; i++) {
      await applyFailureFraming(
        { threadRepo, activityLogRepo, logger: noopLogger, tracker },
        { thread_id: threadIds[i]!, error: new TypeError('fail') }
      )
    }
    expect(tracker.isInDegraded()).toBe(true)

    // 6th failure
    await applyFailureFraming(
      { threadRepo, activityLogRepo, logger: noopLogger, tracker },
      { thread_id: threadIds[5]!, error: new TypeError('fail') }
    )

    // 6th thread: only ONE app message (system framing) — no extension_status
    const messages = await threadRepo.listMessages(threadIds[5]!)
    const appMessages = messages.filter((m) => m.author === 'app') as AppMessage[]
    expect(appMessages.length).toBe(1)
    expect(appMessages[0]!.content.kind).toBe('system')
  })

  it('anchor-thread message append failure is swallowed — applyFailureFraming still resolves', async () => {
    const tracker = new DegradedModeTracker()

    // Create a thread
    const thread = await threadRepo.create({
      trigger: { kind: 'mail', extension_id: 'ext', mail_id: 'x' },
      title: 'Gate test',
    })

    // Drive tracker to 4 failures manually (without using real threadRepo)
    for (let i = 0; i < 4; i++) {
      tracker.recordFailure({ threadId: `fake-${i}`, errorClass: 'TypeError', now: Date.now() + i })
    }

    // Now create a mock threadRepo that rejects on extension_status appends
    let callCount = 0
    const mockThreadRepo = {
      appendMessage: vi.fn().mockImplementation((input: { content: { kind: string } }) => {
        callCount++
        if (input.content.kind === 'extension_status') {
          return Promise.reject(new Error('Anchor thread unavailable'))
        }
        return threadRepo.appendMessage(input as Parameters<typeof threadRepo.appendMessage>[0])
      }),
      markSurfaced: vi.fn().mockResolvedValue(undefined),
      markFirstTurnCompleted: vi.fn().mockResolvedValue(undefined),
    } as unknown as ThreadRepository

    // Should resolve without throwing even if anchor-thread append fails
    await expect(
      applyFailureFraming(
        { threadRepo: mockThreadRepo, activityLogRepo, logger: noopLogger, tracker },
        { thread_id: thread.id, error: new TypeError('fail') }
      )
    ).resolves.toBeDefined()

    // Tracker is in degraded mode
    expect(tracker.isInDegraded()).toBe(true)
  })
})
