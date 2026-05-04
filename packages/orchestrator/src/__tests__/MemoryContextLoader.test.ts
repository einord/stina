import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  StandingInstructionRepository,
  ProfileFactRepository,
  memorySchema,
} from '@stina/memory/db'
import { ThreadRepository, threadsSchema } from '@stina/threads/db'
import type { Thread } from '@stina/core'
import { DefaultMemoryContextLoader } from '../memory/MemoryContextLoader.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Apply both threads and memory migrations against the same in-memory
 * SQLite database. Memory's profile_facts FK references threads(id), so
 * threads migrations must run first.
 */
function createDbs(): {
  threadDb: ReturnType<typeof drizzle<typeof threadsSchema>>
  memoryDb: ReturnType<typeof drizzle<typeof memorySchema>>
} {
  const sqlite = new Database(':memory:')

  const apply = (relativeMigrationsDir: string) => {
    const migrationsDir = path.join(__dirname, '..', '..', '..', relativeMigrationsDir)
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
    for (const file of files) {
      sqlite.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf-8'))
    }
  }

  apply(path.join('threads', 'src', 'db', 'migrations'))
  apply(path.join('memory', 'src', 'db', 'migrations'))

  return {
    threadDb: drizzle(sqlite, { schema: threadsSchema }),
    memoryDb: drizzle(sqlite, { schema: memorySchema }),
  }
}

describe('DefaultMemoryContextLoader', () => {
  let threadRepo: ThreadRepository
  let instructions: StandingInstructionRepository
  let facts: ProfileFactRepository
  let loader: DefaultMemoryContextLoader

  beforeEach(() => {
    const { threadDb, memoryDb } = createDbs()
    threadRepo = new ThreadRepository(threadDb)
    instructions = new StandingInstructionRepository(memoryDb)
    facts = new ProfileFactRepository(memoryDb)
    loader = new DefaultMemoryContextLoader(instructions, facts)
  })

  it('loads only currently-active standing instructions', async () => {
    await instructions.create({
      rule: 'always-active',
      scope: { channels: ['all'] },
      created_by: 'user',
    })
    await instructions.create({
      rule: 'expired',
      scope: { channels: ['all'] },
      valid_until: 1000,
      created_by: 'user',
    })
    await instructions.create({
      rule: 'future',
      scope: { channels: ['all'] },
      valid_from: Date.now() + 60_000,
      created_by: 'user',
    })

    const thread = await threadRepo.create({ trigger: { kind: 'user' }, title: 't' })
    const ctx = await loader.load(thread)

    const rules = ctx.active_instructions.map((i) => i.rule)
    expect(rules).toContain('always-active')
    expect(rules).not.toContain('expired')
    expect(rules).not.toContain('future')
  })

  it('returns no linked facts for a thread with no linked entities', async () => {
    await facts.create({
      fact: 'irrelevant',
      subject: 'someone-else',
      predicate: 'is',
      created_by: 'user',
    })
    const thread = await threadRepo.create({ trigger: { kind: 'user' }, title: 't' })

    const ctx = await loader.load(thread)
    expect(ctx.linked_facts).toEqual([])
  })

  it('matches profile facts by entity ref_id and by snapshot.display', async () => {
    await facts.create({
      fact: 'Peter is the manager',
      subject: 'peter@example.com',
      predicate: 'role',
      created_by: 'user',
    })
    await facts.create({
      fact: 'Peter prefers Tuesday meetings',
      subject: 'Peter Andersson',
      predicate: 'preference',
      created_by: 'stina',
    })
    await facts.create({
      fact: 'irrelevant',
      subject: 'someone-else',
      predicate: 'is',
      created_by: 'user',
    })

    const thread = await threadRepo.create({
      trigger: { kind: 'mail', extension_id: 'mail', mail_id: 'm-1' },
      title: 'mail',
      linkedEntities: [
        {
          kind: 'person',
          extension_id: 'mail',
          ref_id: 'peter@example.com',
          snapshot: { display: 'Peter Andersson' },
        },
      ],
    })

    const ctx = await loader.load(thread)
    const facts_ = ctx.linked_facts.map((f) => f.fact).sort()
    expect(facts_).toEqual(['Peter is the manager', 'Peter prefers Tuesday meetings'])
  })

  it('dedupes when ref_id and display map to the same fact subject', async () => {
    await facts.create({
      fact: 'Same person, one fact',
      subject: 'p1',
      predicate: 'is',
      created_by: 'user',
    })

    const thread = await threadRepo.create({
      trigger: { kind: 'mail', extension_id: 'mail', mail_id: 'm-1' },
      title: 'mail',
      linkedEntities: [
        {
          kind: 'person',
          extension_id: 'mail',
          ref_id: 'p1',
          snapshot: { display: 'p1' }, // identical to ref_id; should not double up
        },
      ],
    })

    const ctx = await loader.load(thread)
    expect(ctx.linked_facts).toHaveLength(1)
  })
})
