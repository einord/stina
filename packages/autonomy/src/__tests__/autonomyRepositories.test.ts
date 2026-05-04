import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AutoPolicyRepository,
  ActivityLogRepository,
  autonomySchema,
} from '../db/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function createTestDb(): BetterSQLite3Database<typeof autonomySchema> {
  const sqlite = new Database(':memory:')
  // Stub threads table for FKs (real wiring runs all migrations together).
  sqlite.exec(`CREATE TABLE threads (id TEXT PRIMARY KEY)`)
  sqlite.prepare('INSERT INTO threads (id) VALUES (?)').run('t-1')
  sqlite.prepare('INSERT INTO threads (id) VALUES (?)').run('t-2')

  const migrationsDir = path.join(__dirname, '..', 'db', 'migrations')
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
    sqlite.exec(sql)
  }
  return drizzle(sqlite, { schema: autonomySchema })
}

describe('AutoPolicyRepository', () => {
  let db: BetterSQLite3Database<typeof autonomySchema>
  let repo: AutoPolicyRepository

  beforeEach(() => {
    db = createTestDb()
    repo = new AutoPolicyRepository(db)
  })

  describe('create / findByTool / findByInstruction', () => {
    it('persists a policy and finds it by tool', async () => {
      const p = await repo.create({
        tool_id: 'mail.reply',
        scope: { standing_instruction_id: 'si-1' },
      })
      const fetched = await repo.findByTool('mail.reply')
      expect(fetched).toHaveLength(1)
      expect(fetched[0]!.id).toBe(p.id)
      expect(fetched[0]!.scope.standing_instruction_id).toBe('si-1')
    })

    it('finds policies bound to an instruction', async () => {
      await repo.create({
        tool_id: 'mail.reply',
        scope: { standing_instruction_id: 'si-1' },
      })
      await repo.create({
        tool_id: 'mail.archive',
        scope: { standing_instruction_id: 'si-1' },
      })
      await repo.create({
        tool_id: 'cal.respond',
        scope: { standing_instruction_id: 'si-2' },
      })

      const bound = await repo.findByInstruction('si-1')
      expect(bound.map((p) => p.tool_id).sort()).toEqual(['mail.archive', 'mail.reply'])
    })

    it('defaults mode to inform and approval_count to 0', async () => {
      const p = await repo.create({
        tool_id: 'x',
        scope: {},
      })
      expect(p.mode).toBe('inform')
      expect(p.approval_count).toBe(0)
      expect(p.created_by_suggestion).toBe(false)
    })
  })

  describe('createGuarded', () => {
    it('refuses to create a policy for a critical tool', async () => {
      await expect(
        repo.createGuarded(
          { tool_id: 'mail.delete_all', scope: {} },
          {
            toolSeverity: 'critical',
            sourceTriggerKind: 'user',
            interactiveApproval: true,
          }
        )
      ).rejects.toThrow(/critical/)
    })

    it('refuses to create a policy in a non-user-triggered thread without interactive approval', async () => {
      await expect(
        repo.createGuarded(
          { tool_id: 'mail.reply', scope: {} },
          {
            toolSeverity: 'high',
            sourceTriggerKind: 'mail',
            interactiveApproval: false,
          }
        )
      ).rejects.toThrow(/interactive user approval/)
    })

    it('allows creation in a non-user-triggered thread with interactive approval', async () => {
      const p = await repo.createGuarded(
        { tool_id: 'mail.reply', scope: {} },
        {
          toolSeverity: 'high',
          sourceTriggerKind: 'mail',
          interactiveApproval: true,
        }
      )
      expect(p.tool_id).toBe('mail.reply')
    })

    it('allows creation in a user-triggered thread without explicit interactive approval', async () => {
      const p = await repo.createGuarded(
        { tool_id: 'mail.reply', scope: {} },
        {
          toolSeverity: 'high',
          sourceTriggerKind: 'user',
          interactiveApproval: false,
        }
      )
      expect(p.tool_id).toBe('mail.reply')
    })
  })

  describe('approval_count + revoke', () => {
    it('increments approval_count atomically', async () => {
      const p = await repo.create({ tool_id: 'x', scope: {} })
      await repo.incrementApprovalCount(p.id)
      await repo.incrementApprovalCount(p.id)
      const fetched = await repo.getById(p.id)
      expect(fetched!.approval_count).toBe(2)
    })

    it('revokes a single policy', async () => {
      const p = await repo.create({ tool_id: 'x', scope: {} })
      await repo.revoke(p.id)
      expect(await repo.getById(p.id)).toBeNull()
    })

    it('cascade-revokes all policies bound to an instruction', async () => {
      await repo.create({ tool_id: 'a', scope: { standing_instruction_id: 'si-1' } })
      await repo.create({ tool_id: 'b', scope: { standing_instruction_id: 'si-1' } })
      await repo.create({ tool_id: 'c', scope: { standing_instruction_id: 'si-2' } })

      const revoked = await repo.revokeByInstruction('si-1')
      expect(revoked).toBe(2)

      const remaining = await repo.listAll()
      expect(remaining).toHaveLength(1)
      expect(remaining[0]!.tool_id).toBe('c')
    })
  })
})

describe('ActivityLogRepository', () => {
  let db: BetterSQLite3Database<typeof autonomySchema>
  let repo: ActivityLogRepository

  beforeEach(() => {
    db = createTestDb()
    repo = new ActivityLogRepository(db)
  })

  it('appends an entry with default severity for non-tool kinds', async () => {
    const entry = await repo.append({
      kind: 'event_silenced',
      summary: 'newsletter mail filtered',
      thread_id: 't-1',
    })
    expect(entry.severity).toBe('low')
    expect(entry.retention_days).toBe(365)
  })

  it('honors caller-supplied severity for tool-driven kinds', async () => {
    const entry = await repo.append({
      kind: 'auto_action',
      severity: 'high',
      summary: 'sent vacation reply',
      thread_id: 't-1',
      details: { tool_id: 'mail.reply', policy_id: 'p1' },
    })
    expect(entry.severity).toBe('high')
    expect(entry.details['tool_id']).toBe('mail.reply')
  })

  it('lists entries filtered by thread_id', async () => {
    await repo.append({ kind: 'event_silenced', summary: 'a', thread_id: 't-1' })
    await repo.append({ kind: 'event_silenced', summary: 'b', thread_id: 't-2' })
    await repo.append({ kind: 'memory_change', summary: 'c', thread_id: 't-1' })

    const t1 = await repo.list({ thread_id: 't-1' })
    expect(t1.map((e) => e.summary).sort()).toEqual(['a', 'c'])
  })

  it('lists entries filtered by kind', async () => {
    await repo.append({ kind: 'auto_action', summary: 'a', thread_id: 't-1' })
    await repo.append({ kind: 'event_silenced', summary: 'b', thread_id: 't-1' })
    await repo.append({ kind: 'auto_action', summary: 'c', thread_id: 't-2' })

    const autos = await repo.list({ kind: 'auto_action' })
    expect(autos.map((e) => e.summary).sort()).toEqual(['a', 'c'])
  })

  it('lists entries filtered by multiple kinds', async () => {
    await repo.append({ kind: 'auto_action', summary: 'a', thread_id: 't-1' })
    await repo.append({ kind: 'event_silenced', summary: 'b', thread_id: 't-1' })
    await repo.append({ kind: 'memory_change', summary: 'c', thread_id: 't-1' })

    const filtered = await repo.list({ kind: ['auto_action', 'event_silenced'] })
    expect(filtered.map((e) => e.summary).sort()).toEqual(['a', 'b'])
  })

  it('listForThreadInline returns entries in chronological order', async () => {
    const e1 = await repo.append({ kind: 'memory_change', summary: 'first', thread_id: 't-1' })
    await new Promise((r) => setTimeout(r, 2))
    const e2 = await repo.append({ kind: 'auto_action', summary: 'second', thread_id: 't-1' })

    const ordered = await repo.listForThreadInline('t-1')
    expect(ordered.map((e) => e.id)).toEqual([e1.id, e2.id])
  })

  it('cleanup removes entries past their retention', async () => {
    // Manually insert an old entry by patching created_at via the underlying handle.
    const old = await repo.append({
      kind: 'event_silenced',
      summary: 'old',
      thread_id: 't-1',
      retention_days: 1,
    })
    const sqlite = (db as unknown as { $client: Database.Database }).$client
    // Move created_at back 2 days so retention has expired.
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000
    sqlite
      .prepare('UPDATE activity_log_entries SET created_at = ? WHERE id = ?')
      .run(twoDaysAgo, old.id)

    await repo.append({
      kind: 'event_silenced',
      summary: 'fresh',
      thread_id: 't-1',
    })

    const removed = await repo.cleanup()
    expect(removed).toBe(1)

    const remaining = await repo.list()
    expect(remaining.map((e) => e.summary)).toEqual(['fresh'])
  })
})
