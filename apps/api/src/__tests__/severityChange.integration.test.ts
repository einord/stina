/**
 * Integration test: §06 severity-change cascade.
 *
 * Does NOT boot a real extension worker — drives `onToolSeverityObserved`
 * directly with two synthetic invocations (severity `high` then `critical`)
 * against the real repos + real `emitEventInternal` pipeline.
 *
 * Assertions (per the brief's acceptance criteria):
 *   a) The auto-policy for 'tool1' is revoked.
 *   b) A `memory_change` activity entry exists with `details.cascaded_from`
 *      matching { kind: 'severity_change', tool_id: 't1', from: 'high', to: 'critical' }.
 *   c) A thread with `trigger.kind === 'stina'` and `reason: 'system_notice'` exists.
 *   d) That thread has an `extension_status: 'severity_changed'` AppMessage with
 *      the revocation-focused Swedish text (N=1).
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
  AutoPolicyRepository,
  ToolSeveritySnapshotRepository,
} from '@stina/autonomy/db'
import { getChatMigrationsPath } from '@stina/chat/db'
import { spawnTriggeredThread, DefaultMemoryContextLoader, applySeverityChangeCascade } from '@stina/orchestrator'
import { asThreadsDb, asMemoryDb, asAutonomyDb } from '../asRedesign2026Db.js'
import type { Thread, AppMessage, ToolSeverity } from '@stina/core'
import { RUNTIME_EXTENSION_ID } from '@stina/core'

// ─── Test app builder ────────────────────────────────────────────────────────

interface TestContext {
  dbPath: string
  policyRepo: AutoPolicyRepository
  activityLogRepo: ActivityLogRepository
  threadRepo: ThreadRepository
  snapshotRepo: ToolSeveritySnapshotRepository
  onToolSeverityObserved: (input: {
    extensionId: string
    toolId: string
    severity: ToolSeverity | undefined
  }) => Promise<void>
}

async function buildTestContext(): Promise<TestContext> {
  closeDb()
  resetDatabaseForTests()

  const dbPath = path.join(
    os.tmpdir(),
    `stina-severity-cascade-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
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

  const rawDb = getDatabase()
  const threadRepo = new ThreadRepository(asThreadsDb(rawDb))
  const policyRepo = new AutoPolicyRepository(asAutonomyDb(rawDb))
  const activityLogRepo = new ActivityLogRepository(asAutonomyDb(rawDb))
  const snapshotRepo = new ToolSeveritySnapshotRepository(asAutonomyDb(rawDb))

  // Minimal emitEventInternal — uses real spawnTriggeredThread pipeline with
  // RUNTIME_EXTENSION_ID source (matching the real app implementation).
  const emitEventInternal = async (input: {
    trigger: import('@stina/core').ThreadTrigger
    content: import('@stina/core').AppContent
    source?: { extension_id?: string; component?: string }
    title?: string
  }) => {
    const db = getDatabase()
    const repo = new ThreadRepository(asThreadsDb(db))
    const memoryLoader = new DefaultMemoryContextLoader(
      new StandingInstructionRepository(asMemoryDb(db)),
      new ProfileFactRepository(asMemoryDb(db))
    )
    const activityLog = new ActivityLogRepository(asAutonomyDb(db))
    const source = {
      extension_id: input.source?.extension_id ?? RUNTIME_EXTENSION_ID,
      ...(input.source?.component ? { component: input.source.component } : {}),
    }
    return spawnTriggeredThread(
      { threadRepo: repo, activityLogRepo: activityLog, memoryLoader, logger },
      { trigger: input.trigger, content: input.content, source, ...(input.title !== undefined ? { title: input.title } : {}) }
    )
  }

  // onToolSeverityObserved mirrors the callback wired in apps/api/src/server.ts.
  const onToolSeverityObserved = async ({
    extensionId,
    toolId,
    severity: rawSeverity,
  }: {
    extensionId: string
    toolId: string
    severity: ToolSeverity | undefined
  }) => {
    const resolved: ToolSeverity = rawSeverity ?? 'medium'

    const result = await snapshotRepo.compare(extensionId, toolId, resolved)

    if (!result.didChange) {
      await snapshotRepo.recordSeen(extensionId, toolId, resolved)
      return
    }

    const drizzleDb = getDatabase()
    const pol = new AutoPolicyRepository(asAutonomyDb(drizzleDb))
    const act = new ActivityLogRepository(asAutonomyDb(drizzleDb))

    await applySeverityChangeCascade(
      { db: asAutonomyDb(drizzleDb), policyRepo: pol, activityLogRepo: act, emitEventInternal, logger },
      { extensionId, toolId, previous: result.previous!, current: result.current }
    )

    await snapshotRepo.recordSeen(extensionId, toolId, resolved)
  }

  return { dbPath, policyRepo, activityLogRepo, threadRepo, snapshotRepo, onToolSeverityObserved }
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

describe('severity-change cascade integration', () => {
  let ctx: TestContext

  beforeEach(async () => {
    ctx = await buildTestContext()
  })

  afterEach(() => {
    teardownTestContext(ctx.dbPath)
  })

  it('high → critical cascade: policy revoked, memory_change written, system_notice thread spawned with correct Swedish text', async () => {
    const { policyRepo, activityLogRepo, threadRepo, onToolSeverityObserved } = ctx

    // Create an auto-policy for tool 't1' (simulates an existing high-severity policy).
    const policy = await policyRepo.create({ tool_id: 't1', scope: {} })

    // Step 1: seed the snapshot at 'high' (simulates the previous process load).
    await onToolSeverityObserved({ extensionId: 'ext1', toolId: 't1', severity: 'high' })

    // The policy should still exist after seeding (no cascade on first load).
    const policiesAfterSeed = await policyRepo.findByTool('t1')
    expect(policiesAfterSeed).toHaveLength(1)
    expect(policiesAfterSeed[0]!.id).toBe(policy.id)

    // Step 2: simulate an extension update that raises severity to 'critical'.
    await onToolSeverityObserved({ extensionId: 'ext1', toolId: 't1', severity: 'critical' })

    // (a) Policy revoked
    const policiesAfterCascade = await policyRepo.findByTool('t1')
    expect(policiesAfterCascade).toHaveLength(0)

    // (b) memory_change activity entry with cascaded_from
    const entries = await activityLogRepo.list({ kind: 'memory_change' })
    expect(entries.length).toBeGreaterThanOrEqual(1)
    const cascadeEntry = entries.find(
      (e) =>
        (e.details as { cascaded_from?: { kind: string } }).cascaded_from?.kind === 'severity_change'
    )
    expect(cascadeEntry).toBeDefined()
    const cascadedFrom = (cascadeEntry!.details as { cascaded_from: { kind: string; tool_id: string; from: string; to: string } }).cascaded_from
    expect(cascadedFrom.kind).toBe('severity_change')
    expect(cascadedFrom.tool_id).toBe('t1')
    expect(cascadedFrom.from).toBe('high')
    expect(cascadedFrom.to).toBe('critical')

    // (c) A thread with trigger.kind === 'stina' and reason: 'system_notice' exists.
    // The cascade spawns a thread; list ALL threads and find the one with 'stina' trigger.
    const threads = await threadRepo.list({ includePending: true })
    const systemNoticeThread = threads.find(
      (t) => t.trigger.kind === 'stina' && (t.trigger as { reason?: string }).reason === 'system_notice'
    )
    expect(systemNoticeThread).toBeDefined()

    // (d) That thread has an extension_status: 'severity_changed' AppMessage.
    const messages = await threadRepo.listMessages(systemNoticeThread!.id)
    const appMsg = messages.find((m) => m.author === 'app') as AppMessage | undefined
    expect(appMsg).toBeDefined()
    expect(appMsg!.content.kind).toBe('extension_status')
    const content = appMsg!.content as { kind: string; status: string; extension_id: string; detail: string }
    expect(content.status).toBe('severity_changed')
    expect(content.extension_id).toBe('ext1')
    // Revocation-focused Swedish text with N=1
    expect(content.detail).toContain('dragits tillbaka')
    expect(content.detail).toContain('1')
  })
})
