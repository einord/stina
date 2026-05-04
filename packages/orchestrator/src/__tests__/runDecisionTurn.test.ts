import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ThreadRepository, threadsSchema } from '@stina/threads/db'
import { runDecisionTurn } from '../runDecisionTurn.js'
import type { DecisionTurnProducer } from '../producers/canned.js'
import type { MemoryContext, MemoryContextLoader } from '../memory/MemoryContextLoader.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function createTestDb(): BetterSQLite3Database<typeof threadsSchema> {
  const sqlite = new Database(':memory:')
  // Apply @stina/threads migrations.
  const migrationsDir = path.join(__dirname, '..', '..', '..', 'threads', 'src', 'db', 'migrations')
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

describe('runDecisionTurn', () => {
  let repo: ThreadRepository

  beforeEach(() => {
    const db = createTestDb()
    repo = new ThreadRepository(db)
  })

  it('appends a stina message and surfaces the thread (canned stub)', async () => {
    const thread = await repo.create({ trigger: { kind: 'user' }, title: 'Hej' })
    await repo.appendMessage({
      thread_id: thread.id,
      author: 'user',
      visibility: 'normal',
      content: { text: 'Vad händer idag?' },
    })

    const result = await runDecisionTurn({ threadId: thread.id, threadRepo: repo })

    expect(result.thread_id).toBe(thread.id)
    expect(result.message.author).toBe('stina')
    expect(result.message.visibility).toBe('normal')
    expect(result.message.content.text).toContain('Vad händer idag?')
    expect(result.surfaced).toBe(true)

    const refreshed = await repo.getById(thread.id)
    expect(refreshed?.surfaced_at).not.toBeNull()

    const messages = await repo.listMessages(thread.id)
    expect(messages).toHaveLength(2)
    expect(messages[1]!.author).toBe('stina')
  })

  it('handles a thread with no user message yet (no quote in stub reply)', async () => {
    const thread = await repo.create({ trigger: { kind: 'user' }, title: 'Tom tråd' })

    const result = await runDecisionTurn({ threadId: thread.id, threadRepo: repo })

    expect(result.message.content.text).toBeTruthy()
    expect(result.message.content.text).not.toContain('"')
  })

  it('throws when the thread does not exist', async () => {
    await expect(runDecisionTurn({ threadId: 'missing', threadRepo: repo })).rejects.toThrow(/not found/i)
  })

  it('throws when the thread is archived', async () => {
    const thread = await repo.create({ trigger: { kind: 'user' }, title: 'Stängd' })
    await repo.setStatus(thread.id, 'quiet')
    await repo.setStatus(thread.id, 'archived')

    await expect(runDecisionTurn({ threadId: thread.id, threadRepo: repo })).rejects.toThrow(/archived/i)
  })

  it('does not re-surface an already-surfaced thread (markSurfaced is idempotent)', async () => {
    const thread = await repo.create({ trigger: { kind: 'user' }, title: 'Pågående' })
    await repo.appendMessage({
      thread_id: thread.id,
      author: 'user',
      visibility: 'normal',
      content: { text: 'första' },
    })
    await repo.markSurfaced(thread.id, 1000)

    const result = await runDecisionTurn({ threadId: thread.id, threadRepo: repo })
    expect(result.surfaced).toBe(true)

    const refreshed = await repo.getById(thread.id)
    expect(refreshed?.surfaced_at).toBe(1000)
  })

  it('respects a silent-visibility producer (no surfacing)', async () => {
    const thread = await repo.create({ trigger: { kind: 'user' }, title: 'Tyst' })
    await repo.appendMessage({
      thread_id: thread.id,
      author: 'user',
      visibility: 'normal',
      content: { text: 'fundera tyst' },
    })

    const silentProducer: DecisionTurnProducer = async () => ({
      visibility: 'silent',
      content: { text: 'intern reflektion' },
    })

    const result = await runDecisionTurn({ threadId: thread.id, threadRepo: repo, producer: silentProducer })

    expect(result.message.visibility).toBe('silent')
    expect(result.surfaced).toBe(false)

    const refreshed = await repo.getById(thread.id)
    expect(refreshed?.surfaced_at).toBeNull()
  })

  it('passes the loaded memory context to the producer', async () => {
    const thread = await repo.create({ trigger: { kind: 'user' }, title: 't' })
    await repo.appendMessage({
      thread_id: thread.id,
      author: 'user',
      visibility: 'normal',
      content: { text: 'hej' },
    })

    const fakeMemory: MemoryContext = {
      active_instructions: [
        {
          id: 'inst-1',
          rule: 'svara alltid kortfattat',
          scope: { channels: ['all'] },
          valid_from: 0,
          valid_until: null,
          invalidate_on: [],
          source_thread_id: null,
          created_at: 0,
          created_by: 'user',
        },
      ],
      linked_facts: [],
    }
    const loader: MemoryContextLoader = {
      async load() {
        return fakeMemory
      },
    }

    let seen: MemoryContext | null = null
    const inspector: DecisionTurnProducer = async ({ memory }) => {
      seen = memory
      return { visibility: 'normal', content: { text: 'ok' } }
    }

    await runDecisionTurn({ threadId: thread.id, threadRepo: repo, memoryLoader: loader, producer: inspector })

    expect(seen).toBe(fakeMemory)
  })

  it('canned stub mentions the count of active instructions when memory is non-empty', async () => {
    const thread = await repo.create({ trigger: { kind: 'user' }, title: 't' })
    await repo.appendMessage({
      thread_id: thread.id,
      author: 'user',
      visibility: 'normal',
      content: { text: 'hej' },
    })

    const loader: MemoryContextLoader = {
      async load() {
        return {
          active_instructions: [
            {
              id: 'a',
              rule: 'r1',
              scope: {},
              valid_from: 0,
              valid_until: null,
              invalidate_on: [],
              source_thread_id: null,
              created_at: 0,
              created_by: 'user',
            },
            {
              id: 'b',
              rule: 'r2',
              scope: {},
              valid_from: 0,
              valid_until: null,
              invalidate_on: [],
              source_thread_id: null,
              created_at: 0,
              created_by: 'user',
            },
          ],
          linked_facts: [],
        }
      },
    }

    const result = await runDecisionTurn({ threadId: thread.id, threadRepo: repo, memoryLoader: loader })
    expect(result.message.content.text).toMatch(/2 viktiga minnen/)
  })

  it('passes the full message timeline (including silent) to the producer', async () => {
    const thread = await repo.create({ trigger: { kind: 'user' }, title: 'Historik' })
    await repo.appendMessage({
      thread_id: thread.id,
      author: 'user',
      visibility: 'normal',
      content: { text: 'A' },
    })
    await repo.appendMessage({
      thread_id: thread.id,
      author: 'stina',
      visibility: 'silent',
      content: { text: 'silent reasoning' },
    })
    await repo.appendMessage({
      thread_id: thread.id,
      author: 'user',
      visibility: 'normal',
      content: { text: 'B' },
    })

    let seenCount = 0
    const inspectingProducer: DecisionTurnProducer = async ({ messages }) => {
      seenCount = messages.length
      return { visibility: 'normal', content: { text: 'ok' } }
    }

    await runDecisionTurn({ threadId: thread.id, threadRepo: repo, producer: inspectingProducer })

    expect(seenCount).toBe(3)
  })
})
