import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ThreadRepository, threadsSchema } from '../db/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Apply the package's own migrations against an in-memory SQLite database.
 * This validates that the migrations themselves produce a usable schema —
 * not just that hand-written test SQL matches the runtime schema.
 */
function createTestDb(): BetterSQLite3Database<typeof threadsSchema> {
  const sqlite = new Database(':memory:')
  const migrationsDir = path.join(__dirname, '..', 'db', 'migrations')
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
    sqlite.exec(sql)
  }
  return drizzle(sqlite, { schema: threadsSchema })
}

describe('ThreadRepository', () => {
  let db: BetterSQLite3Database<typeof threadsSchema>
  let repo: ThreadRepository

  beforeEach(() => {
    db = createTestDb()
    repo = new ThreadRepository(db)
  })

  describe('create', () => {
    it('creates an active background thread by default', async () => {
      const thread = await repo.create({
        trigger: { kind: 'user' },
        title: 'Test thread',
      })

      expect(thread.status).toBe('active')
      expect(thread.surfaced_at).toBeNull()
      expect(thread.notified_at).toBeNull()
      expect(thread.title).toBe('Test thread')
      expect(thread.linked_entities).toEqual([])
    })

    it('round-trips a typed app trigger', async () => {
      const thread = await repo.create({
        trigger: { kind: 'mail', extension_id: 'stina-ext-mail', mail_id: 'm-1' },
        title: 'New mail',
      })

      const fetched = await repo.getById(thread.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.trigger).toEqual({
        kind: 'mail',
        extension_id: 'stina-ext-mail',
        mail_id: 'm-1',
      })
    })

    it('round-trips a stina-trigger with reason and dream_pass_run_id', async () => {
      const thread = await repo.create({
        trigger: {
          kind: 'stina',
          reason: 'dream_pass_insight',
          dream_pass_run_id: 'run-1',
          insight: 'Calendar conflict detected',
        },
        title: 'Insight: calendar conflict',
      })

      const fetched = await repo.getById(thread.id)
      expect(fetched!.trigger).toMatchObject({
        kind: 'stina',
        reason: 'dream_pass_insight',
        dream_pass_run_id: 'run-1',
      })
    })
  })

  describe('list', () => {
    it('returns threads ordered by last_activity_at desc', async () => {
      const t1 = await repo.create({ trigger: { kind: 'user' }, title: 'first' })
      // Force a small delay so timestamps differ
      await new Promise((r) => setTimeout(r, 2))
      const t2 = await repo.create({ trigger: { kind: 'user' }, title: 'second' })

      const list = await repo.list()
      expect(list.map((t) => t.id)).toEqual([t2.id, t1.id])
    })

    it('filters by status', async () => {
      const active = await repo.create({ trigger: { kind: 'user' }, title: 'active' })
      const archived = await repo.create({ trigger: { kind: 'user' }, title: 'archived' })
      await repo.setStatus(archived.id, 'archived')

      const onlyActive = await repo.list({ status: 'active' })
      expect(onlyActive.map((t) => t.id)).toEqual([active.id])

      const onlyArchived = await repo.list({ status: 'archived' })
      expect(onlyArchived.map((t) => t.id)).toEqual([archived.id])
    })

    it('filters background vs surfaced', async () => {
      const bg = await repo.create({ trigger: { kind: 'user' }, title: 'background' })
      const surf = await repo.create({ trigger: { kind: 'user' }, title: 'surfaced' })
      await repo.markSurfaced(surf.id, 12345)

      const background = await repo.list({ surfacing: 'background' })
      expect(background.map((t) => t.id)).toEqual([bg.id])

      const surfaced = await repo.list({ surfacing: 'surfaced' })
      expect(surfaced.map((t) => t.id)).toEqual([surf.id])
    })

    it('filters by trigger kind via JSON extract', async () => {
      const userT = await repo.create({ trigger: { kind: 'user' }, title: 'user' })
      const mailT = await repo.create({
        trigger: { kind: 'mail', extension_id: 'm', mail_id: '1' },
        title: 'mail',
      })

      const onlyMail = await repo.list({ triggerKind: 'mail' })
      expect(onlyMail.map((t) => t.id)).toEqual([mailT.id])

      const onlyUser = await repo.list({ triggerKind: 'user' })
      expect(onlyUser.map((t) => t.id)).toEqual([userT.id])
    })
  })

  describe('setStatus', () => {
    it('allows active → quiet → active → archived', async () => {
      const t = await repo.create({ trigger: { kind: 'user' }, title: 't' })
      await repo.setStatus(t.id, 'quiet')
      expect((await repo.getById(t.id))!.status).toBe('quiet')
      await repo.setStatus(t.id, 'active')
      expect((await repo.getById(t.id))!.status).toBe('active')
      await repo.setStatus(t.id, 'archived')
      expect((await repo.getById(t.id))!.status).toBe('archived')
    })

    it('rejects archived → active (archived is terminal in v1)', async () => {
      const t = await repo.create({ trigger: { kind: 'user' }, title: 't' })
      await repo.setStatus(t.id, 'archived')
      await expect(repo.setStatus(t.id, 'active')).rejects.toThrow(/Illegal/)
    })

    it('rejects unknown thread id', async () => {
      await expect(repo.setStatus('nope', 'archived')).rejects.toThrow(/not found/)
    })
  })

  describe('markSurfaced / markNotified', () => {
    it('sets surfaced_at and is monotonic (idempotent)', async () => {
      const t = await repo.create({ trigger: { kind: 'user' }, title: 't' })
      await repo.markSurfaced(t.id, 1000)
      expect((await repo.getById(t.id))!.surfaced_at).toBe(1000)
      // Second call must not overwrite — surfacing is monotonic per §02/§04.
      await repo.markSurfaced(t.id, 2000)
      expect((await repo.getById(t.id))!.surfaced_at).toBe(1000)
    })

    it('sets notified_at independently from surfaced_at', async () => {
      const t = await repo.create({ trigger: { kind: 'user' }, title: 't' })
      await repo.markNotified(t.id, 500)
      const fetched = await repo.getById(t.id)
      expect(fetched!.notified_at).toBe(500)
      expect(fetched!.surfaced_at).toBeNull()
    })
  })

  describe('appendMessage', () => {
    it('inserts a user message and advances last_activity_at', async () => {
      const t = await repo.create({ trigger: { kind: 'user' }, title: 't' })
      const initialActivity = t.last_activity_at

      await new Promise((r) => setTimeout(r, 2))
      await repo.appendMessage({
        thread_id: t.id,
        author: 'user',
        visibility: 'normal',
        content: { text: 'hello' },
      })

      const after = await repo.getById(t.id)
      expect(after!.last_activity_at).toBeGreaterThan(initialActivity)
    })

    it('auto-revives a quiet thread back to active on new activity', async () => {
      const t = await repo.create({ trigger: { kind: 'user' }, title: 't' })
      await repo.setStatus(t.id, 'quiet')
      expect((await repo.getById(t.id))!.status).toBe('quiet')

      await repo.appendMessage({
        thread_id: t.id,
        author: 'user',
        visibility: 'normal',
        content: { text: 'reply' },
      })

      expect((await repo.getById(t.id))!.status).toBe('active')
    })

    it('persists app message source for the trust boundary', async () => {
      const t = await repo.create({
        trigger: { kind: 'mail', extension_id: 'stina-ext-mail', mail_id: 'm1' },
        title: 'Mail thread',
      })

      await repo.appendMessage({
        thread_id: t.id,
        author: 'app',
        visibility: 'normal',
        source: { extension_id: 'stina-ext-mail', component: 'inbox-watcher' },
        content: {
          kind: 'mail',
          from: 'peter@example.com',
          subject: 'Q2 plan',
          snippet: 'Hej, hur går det…',
          mail_id: 'm1',
        },
      })

      const messages = await repo.listMessages(t.id)
      expect(messages).toHaveLength(1)
      const msg = messages[0]!
      expect(msg.author).toBe('app')
      if (msg.author === 'app') {
        expect(msg.source).toEqual({
          extension_id: 'stina-ext-mail',
          component: 'inbox-watcher',
        })
        expect(msg.content.kind).toBe('mail')
      }
    })

    it('listMessages excludes silent messages by default', async () => {
      const t = await repo.create({ trigger: { kind: 'user' }, title: 't' })
      await repo.appendMessage({
        thread_id: t.id,
        author: 'user',
        visibility: 'normal',
        content: { text: 'visible' },
      })
      await repo.appendMessage({
        thread_id: t.id,
        author: 'stina',
        visibility: 'silent',
        content: { text: 'internal reasoning' },
      })

      const visible = await repo.listMessages(t.id)
      expect(visible).toHaveLength(1)

      const all = await repo.listMessages(t.id, { includeSilent: true })
      expect(all).toHaveLength(2)
    })
  })

  describe('cascading delete', () => {
    it('deletes messages when their thread is deleted (FK cascade)', async () => {
      const t = await repo.create({ trigger: { kind: 'user' }, title: 't' })
      await repo.appendMessage({
        thread_id: t.id,
        author: 'user',
        visibility: 'normal',
        content: { text: 'hi' },
      })

      // Delete the thread directly via the underlying SQLite handle to verify
      // the FK cascade defined in the migration.
      const sqlite = (db as unknown as { $client: Database.Database }).$client
      sqlite.prepare('DELETE FROM threads WHERE id = ?').run(t.id)

      const remainingMessages = sqlite
        .prepare('SELECT COUNT(*) as count FROM messages WHERE thread_id = ?')
        .get(t.id) as { count: number }
      expect(remainingMessages.count).toBe(0)
    })
  })
})
