/**
 * Unit tests for applySeverityChangeCascade (§06 severity-change table).
 *
 * Covers the six scenarios specified in the brief:
 *  1. low → high:    0 policies revoked, 1 notification spawned.
 *  2. medium → high: 0 policies revoked, 1 notification spawned.
 *  3. high → critical, 0 policies: 0 revoked, 1 notification spawned.
 *  4. high → critical, 2 policies: 2 revoked + 2 memory_change entries, 1 notification.
 *  5. critical → high (lowering): 0 revoked, 0 notifications, returns null.
 *  6. critical → medium:           same silent no-op.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AutoPolicyRepository,
  ActivityLogRepository,
  autonomySchema,
} from '@stina/autonomy/db'
import { applySeverityChangeCascade } from '../severityChangeCascade.js'
import type { SeverityChangeCascadeDeps } from '../severityChangeCascade.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function createTestDb() {
  const sqlite = new Database(':memory:')
  // Stub threads table for FKs referenced by autonomy migrations.
  sqlite.exec(`CREATE TABLE threads (id TEXT PRIMARY KEY)`)

  const migrationsDir = path.join(__dirname, '..', '..', '..', 'autonomy', 'src', 'db', 'migrations')
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files) {
    sqlite.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf-8'))
  }

  return drizzle(sqlite, { schema: autonomySchema })
}

function makeDeps(
  db: ReturnType<typeof createTestDb>,
  emitEventInternal: SeverityChangeCascadeDeps['emitEventInternal']
): SeverityChangeCascadeDeps {
  return {
    db,
    policyRepo: new AutoPolicyRepository(db),
    activityLogRepo: new ActivityLogRepository(db),
    emitEventInternal,
    logger: { warn: vi.fn(), info: vi.fn() },
  }
}

describe('applySeverityChangeCascade', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
  })

  it('low → high: 0 policies revoked, 1 notification spawned with system_notice reason', async () => {
    let capturedInput: Parameters<SeverityChangeCascadeDeps['emitEventInternal']>[0] | null = null
    const emitEventInternal = vi.fn(async (input) => {
      capturedInput = input
      return { thread_id: 'thread-low-high' }
    })

    const result = await applySeverityChangeCascade(makeDeps(db, emitEventInternal), {
      extensionId: 'ext1',
      toolId: 'tool1',
      previous: 'low',
      current: 'high',
    })

    expect(result.policiesRevoked).toBe(0)
    expect(result.notificationThreadId).toBe('thread-low-high')
    expect(emitEventInternal).toHaveBeenCalledOnce()
    expect(capturedInput!.trigger.kind).toBe('stina')
    expect((capturedInput!.trigger as { kind: 'stina'; reason: string }).reason).toBe('system_notice')
    expect(capturedInput!.content.kind).toBe('extension_status')
    expect((capturedInput!.content as { status: string }).status).toBe('severity_changed')
  })

  it('medium → high: 0 policies revoked, 1 notification spawned', async () => {
    const emitEventInternal = vi.fn(async () => ({ thread_id: 'thread-med-high' }))

    const result = await applySeverityChangeCascade(makeDeps(db, emitEventInternal), {
      extensionId: 'ext1',
      toolId: 'tool1',
      previous: 'medium',
      current: 'high',
    })

    expect(result.policiesRevoked).toBe(0)
    expect(result.notificationThreadId).toBe('thread-med-high')
    expect(emitEventInternal).toHaveBeenCalledOnce()
  })

  it('high → critical, 0 existing policies: 0 revoked, 1 notification spawned', async () => {
    let capturedContent: { detail?: string } = {}
    const emitEventInternal = vi.fn(async (input: Parameters<SeverityChangeCascadeDeps['emitEventInternal']>[0]) => {
      capturedContent = input.content as { detail?: string }
      return { thread_id: 'thread-high-crit-0' }
    })

    const result = await applySeverityChangeCascade(makeDeps(db, emitEventInternal), {
      extensionId: 'ext1',
      toolId: 'tool1',
      previous: 'high',
      current: 'critical',
    })

    expect(result.policiesRevoked).toBe(0)
    expect(result.notificationThreadId).toBe('thread-high-crit-0')
    expect(emitEventInternal).toHaveBeenCalledOnce()

    // The awareness-only text should NOT contain "dragits tillbaka"
    expect(capturedContent.detail).not.toContain('dragits tillbaka')
    expect(capturedContent.detail).toContain('kan inte längre policyas')
  })

  it('high → critical, 2 existing policies: 2 revoked + memory_change entries, 1 notification', async () => {
    const policyRepo = new AutoPolicyRepository(db)
    const activityLogRepo = new ActivityLogRepository(db)

    // Create 2 policies for the tool
    await policyRepo.create({ tool_id: 'tool1', scope: {} })
    await policyRepo.create({ tool_id: 'tool1', scope: { standing_instruction_id: 'si-1' } })

    // Also create a policy for a different tool (should NOT be revoked)
    await policyRepo.create({ tool_id: 'other-tool', scope: {} })

    let capturedDetail = ''
    const emitEventInternal = vi.fn(async (input) => {
      capturedDetail = (input.content as { detail: string }).detail
      return { thread_id: 'thread-high-crit-2' }
    })

    const deps: SeverityChangeCascadeDeps = {
      db,
      policyRepo,
      activityLogRepo,
      emitEventInternal,
      logger: { warn: vi.fn(), info: vi.fn() },
    }

    const result = await applySeverityChangeCascade(deps, {
      extensionId: 'ext1',
      toolId: 'tool1',
      previous: 'high',
      current: 'critical',
    })

    expect(result.policiesRevoked).toBe(2)
    expect(result.notificationThreadId).toBe('thread-high-crit-2')
    expect(emitEventInternal).toHaveBeenCalledOnce()

    // Revocation-focused Swedish text
    expect(capturedDetail).toContain('dragits tillbaka')
    expect(capturedDetail).toContain('2')

    // The tool1 policies should be revoked
    const remaining = await policyRepo.findByTool('tool1')
    expect(remaining).toHaveLength(0)

    // The other-tool policy should still exist
    const otherRemaining = await policyRepo.findByTool('other-tool')
    expect(otherRemaining).toHaveLength(1)

    // 2 memory_change activity entries should be written
    const entries = await activityLogRepo.list({ kind: 'memory_change' })
    expect(entries).toHaveLength(2)
    for (const entry of entries) {
      expect(entry.kind).toBe('memory_change')
      expect(entry.severity).toBe('critical')
      const cascadedFrom = (entry.details as { cascaded_from: { kind: string; from: string; to: string } }).cascaded_from
      expect(cascadedFrom.kind).toBe('severity_change')
      expect(cascadedFrom.from).toBe('high')
      expect(cascadedFrom.to).toBe('critical')
    }
  })

  it('critical → high (lowering): 0 revoked, 0 notifications, returns notificationThreadId: null', async () => {
    const emitEventInternal = vi.fn(async () => ({ thread_id: 'should-not-be-called' }))

    const result = await applySeverityChangeCascade(makeDeps(db, emitEventInternal), {
      extensionId: 'ext1',
      toolId: 'tool1',
      previous: 'critical',
      current: 'high',
    })

    expect(result.policiesRevoked).toBe(0)
    expect(result.notificationThreadId).toBeNull()
    expect(emitEventInternal).not.toHaveBeenCalled()
  })

  it('critical → medium (lowering): 0 revoked, 0 notifications, returns notificationThreadId: null', async () => {
    const emitEventInternal = vi.fn(async () => ({ thread_id: 'should-not-be-called' }))

    const result = await applySeverityChangeCascade(makeDeps(db, emitEventInternal), {
      extensionId: 'ext1',
      toolId: 'tool1',
      previous: 'critical',
      current: 'medium',
    })

    expect(result.policiesRevoked).toBe(0)
    expect(result.notificationThreadId).toBeNull()
    expect(emitEventInternal).not.toHaveBeenCalled()
  })
})
