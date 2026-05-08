/**
 * Unit tests for spawnTriggeredThread (§04 Phase 8f + Phase 8h degraded-mode exit).
 *
 * Covers:
 *   - Happy path: stina-trigger + system content → thread created, AppMessage appended,
 *     decision turn runs, first_turn_completed_at set, activity log entry present.
 *   - Failure path: producer throws → applyFailureFraming runs → TWO system-kind AppMessages,
 *     both with source.extension_id === RUNTIME_EXTENSION_ID.
 *   - Title override: explicit title wins over deriveTitleFromAppContent.
 *   - Degraded mode exit: after entering via injected tracker state, a successful spawn
 *     writes the exit extension_status AppMessage on the anchor thread + activity log entry.
 *   - Anchor-thread append failure on exit is swallowed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ThreadRepository, threadsSchema } from '@stina/threads/db'
import { ActivityLogRepository, autonomySchema } from '@stina/autonomy/db'
import { RUNTIME_EXTENSION_ID } from '@stina/core'
import type { AppMessage } from '@stina/core'
import type { DecisionTurnProducer } from '../producers/canned.js'
import { spawnTriggeredThread } from '../spawnTriggeredThread.js'
import { DegradedModeTracker, DEGRADED_MODE_FAILURE_THRESHOLD } from '../degradedMode.js'

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

// ─── Happy path ──────────────────────────────────────────────────────────────

describe('spawnTriggeredThread — happy path', () => {
  let threadRepo: ThreadRepository
  let activityLogRepo: ActivityLogRepository

  beforeEach(() => {
    const dbs = createTestDbs()
    threadRepo = dbs.threadRepo
    activityLogRepo = dbs.activityLogRepo
  })

  it('creates a thread, appends AppMessage with runtime source, runs decision turn, lifts gate', async () => {
    const { thread_id } = await spawnTriggeredThread(
      { threadRepo, activityLogRepo, logger: noopLogger },
      {
        trigger: { kind: 'stina', reason: 'dream_pass_insight' },
        content: { kind: 'system', message: 'Ny insikt från dream pass' },
        source: { extension_id: RUNTIME_EXTENSION_ID },
      }
    )

    expect(thread_id).toBeTruthy()

    // Thread exists
    const thread = await threadRepo.getById(thread_id)
    expect(thread).not.toBeNull()
    expect(thread!.trigger.kind).toBe('stina')

    // AppMessage persisted with runtime source
    const messages = await threadRepo.listMessages(thread_id)
    const appMsg = messages.find((m) => m.author === 'app') as AppMessage | undefined
    expect(appMsg).toBeDefined()
    expect(appMsg!.source.extension_id).toBe(RUNTIME_EXTENSION_ID)
    expect(appMsg!.content.kind).toBe('system')

    // Decision turn ran (canned stub appends a stina message)
    const stinaMsg = messages.find((m) => m.author === 'stina')
    expect(stinaMsg).toBeDefined()

    // First-turn gate lifted
    const refreshed = await threadRepo.getById(thread_id)
    expect(refreshed!.first_turn_completed_at).not.toBeNull()
  })

  it('thread becomes visible (surfaced) after canned stub decision turn', async () => {
    const { thread_id } = await spawnTriggeredThread(
      { threadRepo, activityLogRepo, logger: noopLogger },
      {
        trigger: { kind: 'stina', reason: 'manual' },
        content: { kind: 'system', message: 'Manual runtime message' },
        source: { extension_id: RUNTIME_EXTENSION_ID },
      }
    )

    const thread = await threadRepo.getById(thread_id)
    expect(thread!.surfaced_at).not.toBeNull()
  })
})

// ─── Failure path ─────────────────────────────────────────────────────────────

describe('spawnTriggeredThread — failure path', () => {
  let threadRepo: ThreadRepository
  let activityLogRepo: ActivityLogRepository

  beforeEach(() => {
    const dbs = createTestDbs()
    threadRepo = dbs.threadRepo
    activityLogRepo = dbs.activityLogRepo
  })

  it('producer throws → applyFailureFraming runs → two system-kind AppMessages with RUNTIME source', async () => {
    const throwingProducer: DecisionTurnProducer = vi.fn().mockRejectedValue(new Error('model unavailable'))

    const { thread_id } = await spawnTriggeredThread(
      { threadRepo, activityLogRepo, producer: throwingProducer, logger: noopLogger },
      {
        trigger: { kind: 'stina', reason: 'dream_pass_insight' },
        content: { kind: 'system', message: 'Insight payload' },
        source: { extension_id: RUNTIME_EXTENSION_ID },
      }
    )

    const messages = await threadRepo.listMessages(thread_id)
    const appMessages = messages.filter((m) => m.author === 'app') as AppMessage[]

    // Brief spec: TWO system-kind messages — original + failure framing
    expect(appMessages).toHaveLength(2)
    for (const msg of appMessages) {
      expect(msg.content.kind).toBe('system')
      expect(msg.source.extension_id).toBe(RUNTIME_EXTENSION_ID)
    }

    // Activity log entry written with failure: true
    const entries = await activityLogRepo.list({ thread_id, kind: 'event_handled' })
    expect(entries.length).toBe(1)
    expect(entries[0]!.details['failure']).toBe(true)

    // Gate lifted (applyFailureFraming calls markFirstTurnCompleted after framing append)
    const thread = await threadRepo.getById(thread_id)
    expect(thread!.first_turn_completed_at).not.toBeNull()
  })
})

// ─── Title override ───────────────────────────────────────────────────────────

describe('spawnTriggeredThread — title override', () => {
  let threadRepo: ThreadRepository
  let activityLogRepo: ActivityLogRepository

  beforeEach(() => {
    const dbs = createTestDbs()
    threadRepo = dbs.threadRepo
    activityLogRepo = dbs.activityLogRepo
  })

  it('explicit title wins over deriveTitleFromAppContent', async () => {
    const { thread_id } = await spawnTriggeredThread(
      { threadRepo, activityLogRepo, logger: noopLogger },
      {
        trigger: { kind: 'stina', reason: 'recap' },
        content: { kind: 'system', message: 'This would be the derived title if not overridden' },
        source: { extension_id: RUNTIME_EXTENSION_ID },
        title: 'Explicit override title',
      }
    )

    const thread = await threadRepo.getById(thread_id)
    expect(thread!.title).toBe('Explicit override title')
  })

  it('without override, title is derived from system content message', async () => {
    const message = 'Ny sammanfattning för dagen'
    const { thread_id } = await spawnTriggeredThread(
      { threadRepo, activityLogRepo, logger: noopLogger },
      {
        trigger: { kind: 'stina', reason: 'recap' },
        content: { kind: 'system', message },
        source: { extension_id: RUNTIME_EXTENSION_ID },
      }
    )

    const thread = await threadRepo.getById(thread_id)
    expect(thread!.title).toBe(message)
  })
})

// ─── Degraded mode exit — anchor message ─────────────────────────────────────

describe('spawnTriggeredThread — degraded mode exit', () => {
  let threadRepo: ThreadRepository
  let activityLogRepo: ActivityLogRepository

  beforeEach(() => {
    const dbs = createTestDbs()
    threadRepo = dbs.threadRepo
    activityLogRepo = dbs.activityLogRepo
    noopLogger.warn.mockClear()
  })

  it('after entering degraded mode, a successful spawn writes exit extension_status AppMessage on anchor thread + activity log entry', async () => {
    const tracker = new DegradedModeTracker()

    // Create DEGRADED_MODE_FAILURE_THRESHOLD failure threads to set up anchor
    const failThreadIds: string[] = []
    for (let i = 0; i < DEGRADED_MODE_FAILURE_THRESHOLD; i++) {
      const throwingProducer: DecisionTurnProducer = vi.fn().mockRejectedValue(new TypeError('fail'))
      const { thread_id } = await spawnTriggeredThread(
        { threadRepo, activityLogRepo, producer: throwingProducer, logger: noopLogger, tracker },
        {
          trigger: { kind: 'stina', reason: 'dream_pass_insight' },
          content: { kind: 'system', message: `Failure ${i}` },
          source: { extension_id: RUNTIME_EXTENSION_ID },
        }
      )
      failThreadIds.push(thread_id)
    }

    expect(tracker.isInDegraded()).toBe(true)
    const anchorThreadId = failThreadIds[DEGRADED_MODE_FAILURE_THRESHOLD - 1]! // 5th thread

    // Successful spawn — exits degraded mode and writes recovery message on anchor
    await spawnTriggeredThread(
      { threadRepo, activityLogRepo, logger: noopLogger, tracker },
      {
        trigger: { kind: 'stina', reason: 'dream_pass_insight' },
        content: { kind: 'system', message: 'Recovery turn' },
        source: { extension_id: RUNTIME_EXTENSION_ID },
      }
    )

    expect(tracker.isInDegraded()).toBe(false)

    // Anchor thread should have an extension_status: degraded_mode_exited message
    const messages = await threadRepo.listMessages(anchorThreadId)
    const appMessages = messages.filter((m) => m.author === 'app') as AppMessage[]

    const exitMsg = appMessages.find(
      (m) => m.content.kind === 'extension_status' &&
        (m.content as { kind: string; status: string }).status === 'degraded_mode_exited'
    ) as AppMessage | undefined
    expect(exitMsg).toBeDefined()
    expect(exitMsg!.source.extension_id).toBe(RUNTIME_EXTENSION_ID)
    if (exitMsg && exitMsg.content.kind === 'extension_status') {
      expect(exitMsg.content.status).toBe('degraded_mode_exited')
      expect(exitMsg.content.detail).toContain('Återhämtning')
      expect(exitMsg.content.detail).toContain(String(DEGRADED_MODE_FAILURE_THRESHOLD))
    }

    // Activity log entry on anchor thread for the exit transition
    const entries = await activityLogRepo.list({ thread_id: anchorThreadId, kind: 'event_handled' })
    const exitEntry = entries.find(
      (e) => (e.details as Record<string, unknown>)['degraded_mode_transition'] === 'exited'
    )
    expect(exitEntry).toBeDefined()
    expect((exitEntry!.details as Record<string, unknown>)['aggregated_count']).toBe(
      DEGRADED_MODE_FAILURE_THRESHOLD
    )
  })

  it('anchor-thread append failure on exit is swallowed — tracker still resets', async () => {
    const tracker = new DegradedModeTracker()

    // Manually drive tracker into degraded mode (no real threads needed for anchor)
    for (let i = 0; i < DEGRADED_MODE_FAILURE_THRESHOLD; i++) {
      tracker.recordFailure({ threadId: `fake-${i}`, errorClass: 'TypeError', now: Date.now() + i })
    }
    expect(tracker.isInDegraded()).toBe(true)

    // Mock threadRepo: appendMessage fails on extension_status
    const realDbs = createTestDbs()
    const mockThreadRepo = {
      create: vi.fn().mockImplementation((input: Parameters<typeof realDbs.threadRepo.create>[0]) =>
        realDbs.threadRepo.create(input)
      ),
      appendMessage: vi.fn().mockImplementation((input: { content: { kind: string } }) => {
        if (input.content.kind === 'extension_status') {
          return Promise.reject(new Error('Anchor unavailable'))
        }
        return realDbs.threadRepo.appendMessage(input as Parameters<typeof realDbs.threadRepo.appendMessage>[0])
      }),
      listMessages: vi.fn().mockImplementation((id: string) => realDbs.threadRepo.listMessages(id)),
      getById: vi.fn().mockImplementation((id: string) => realDbs.threadRepo.getById(id)),
      markSurfaced: vi.fn().mockResolvedValue(undefined),
      markFirstTurnCompleted: vi.fn().mockResolvedValue(undefined),
    } as unknown as ThreadRepository

    // Should resolve without throwing
    await expect(
      spawnTriggeredThread(
        { threadRepo: mockThreadRepo, activityLogRepo, logger: noopLogger, tracker },
        {
          trigger: { kind: 'stina', reason: 'manual' },
          content: { kind: 'system', message: 'Recovery' },
          source: { extension_id: RUNTIME_EXTENSION_ID },
        }
      )
    ).resolves.toBeDefined()

    // Tracker exits degraded mode despite append failure
    expect(tracker.isInDegraded()).toBe(false)
  })
})
