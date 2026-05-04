import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  StandingInstructionRepository,
  ProfileFactRepository,
  ThreadSummaryRepository,
  memorySchema,
} from '../db/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function createTestDb(): BetterSQLite3Database<typeof memorySchema> {
  const sqlite = new Database(':memory:')
  // Memory's migration FKs reference threads(id), which lives in @stina/threads.
  // For isolated unit tests we create a minimal stub so the FK declarations
  // are valid. (Integration-level tests run the full migration set.)
  sqlite.exec(`CREATE TABLE threads (id TEXT PRIMARY KEY)`)

  const migrationsDir = path.join(__dirname, '..', 'db', 'migrations')
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
    sqlite.exec(sql)
  }
  return drizzle(sqlite, { schema: memorySchema })
}

describe('StandingInstructionRepository', () => {
  let db: BetterSQLite3Database<typeof memorySchema>
  let repo: StandingInstructionRepository

  beforeEach(() => {
    db = createTestDb()
    repo = new StandingInstructionRepository(db)
  })

  it('creates and reads back an instruction', async () => {
    const instr = await repo.create({
      rule: 'Reply that I am on vacation',
      scope: { channels: ['mail'] },
      created_by: 'user',
    })
    const fetched = await repo.getById(instr.id)
    expect(fetched).toMatchObject({
      rule: 'Reply that I am on vacation',
      created_by: 'user',
    })
    expect(fetched!.scope).toEqual({ channels: ['mail'] })
  })

  it('listActive includes only instructions valid at the given time', async () => {
    const now = 1_000_000
    await repo.create({
      rule: 'expired',
      scope: {},
      valid_from: now - 1000,
      valid_until: now - 1,
      created_by: 'stina',
    })
    await repo.create({
      rule: 'active',
      scope: {},
      valid_from: now - 1000,
      valid_until: now + 1000,
      created_by: 'stina',
    })
    await repo.create({
      rule: 'future',
      scope: {},
      valid_from: now + 100,
      valid_until: null,
      created_by: 'stina',
    })
    await repo.create({
      rule: 'indefinite',
      scope: {},
      valid_from: now - 1000,
      valid_until: null,
      created_by: 'user',
    })

    const active = await repo.listActive(now)
    const rules = active.map((i) => i.rule).sort()
    expect(rules).toEqual(['active', 'indefinite'])
  })

  it('expirePast removes instructions with valid_until in the past', async () => {
    const now = 2_000_000
    await repo.create({
      rule: 'A',
      scope: {},
      valid_from: now - 1000,
      valid_until: now - 1,
      created_by: 'stina',
    })
    await repo.create({
      rule: 'B',
      scope: {},
      valid_from: now - 1000,
      valid_until: now + 1000,
      created_by: 'stina',
    })
    await repo.create({
      rule: 'C',
      scope: {},
      valid_from: now - 1000,
      valid_until: null,
      created_by: 'user',
    })

    const expired = await repo.expirePast(now)
    expect(expired).toBe(1)

    const remaining = (await repo.listAll()).map((i) => i.rule).sort()
    expect(remaining).toEqual(['B', 'C'])
  })

  it('mutateAsDreamPass refuses user-set instructions', async () => {
    const userInstr = await repo.create({
      rule: 'user-set rule',
      scope: {},
      created_by: 'user',
    })
    const stinaInstr = await repo.create({
      rule: 'stina-extracted rule',
      scope: {},
      created_by: 'stina',
    })

    await expect(repo.mutateAsDreamPass(userInstr.id, () => {})).rejects.toThrow(
      /user-set standing instruction/
    )
    // stina-set is allowed
    let calledWith: string | null = null
    await repo.mutateAsDreamPass(stinaInstr.id, (current) => {
      calledWith = current.rule
    })
    expect(calledWith).toBe('stina-extracted rule')
  })

  it('mutateAsDreamPass throws on missing id', async () => {
    await expect(repo.mutateAsDreamPass('nonexistent', () => {})).rejects.toThrow(/not found/)
  })
})

describe('ProfileFactRepository', () => {
  let db: BetterSQLite3Database<typeof memorySchema>
  let repo: ProfileFactRepository

  beforeEach(() => {
    db = createTestDb()
    repo = new ProfileFactRepository(db)
  })

  it('creates and finds by subject + predicate', async () => {
    await repo.create({
      fact: 'Peter is the manager',
      subject: 'user',
      predicate: 'manager_is',
      created_by: 'stina',
    })
    await repo.create({
      fact: 'Anna is the spouse',
      subject: 'user',
      predicate: 'spouse_is',
      created_by: 'user',
    })

    const managers = await repo.findBySubject('user', 'manager_is')
    expect(managers).toHaveLength(1)
    expect(managers[0]!.fact).toBe('Peter is the manager')

    const all = await repo.findBySubject('user')
    expect(all).toHaveLength(2)
  })

  it('listStale returns facts older than the threshold', async () => {
    const old = await repo.create({
      fact: 'old',
      subject: 'user',
      predicate: 'old_pred',
      created_by: 'stina',
    })
    // Manually backdate via touch
    await repo.touch(old.id, 1000)
    const fresh = await repo.create({
      fact: 'fresh',
      subject: 'user',
      predicate: 'fresh_pred',
      created_by: 'stina',
    })
    await repo.touch(fresh.id, 100_000_000_000)

    const stale = await repo.listStale(50_000_000_000)
    expect(stale).toHaveLength(1)
    expect(stale[0]!.fact).toBe('old')
  })

  it('touch advances last_referenced_at', async () => {
    const fact = await repo.create({
      fact: 'x',
      subject: 's',
      predicate: 'p',
      created_by: 'stina',
    })
    const before = fact.last_referenced_at
    await new Promise((r) => setTimeout(r, 2))
    await repo.touch(fact.id)
    const after = await repo.getById(fact.id)
    expect(after!.last_referenced_at).toBeGreaterThan(before)
  })

  it('deleteAsDreamPass refuses user-set facts', async () => {
    const userFact = await repo.create({
      fact: 'user fact',
      subject: 's',
      predicate: 'p',
      created_by: 'user',
    })
    const stinaFact = await repo.create({
      fact: 'stina fact',
      subject: 's2',
      predicate: 'p',
      created_by: 'stina',
    })

    await expect(repo.deleteAsDreamPass(userFact.id)).rejects.toThrow(/user-set profile fact/)
    expect(await repo.getById(userFact.id)).not.toBeNull()

    await repo.deleteAsDreamPass(stinaFact.id)
    expect(await repo.getById(stinaFact.id)).toBeNull()
  })
})

describe('ThreadSummaryRepository', () => {
  let db: BetterSQLite3Database<typeof memorySchema>
  let repo: ThreadSummaryRepository

  beforeEach(() => {
    db = createTestDb()
    // Insert a stub thread row so the FK on thread_summaries.thread_id resolves.
    const sqlite = (db as unknown as { $client: Database.Database }).$client
    sqlite.prepare('INSERT INTO threads (id) VALUES (?)').run('t-1')
    repo = new ThreadSummaryRepository(db)
  })

  it('upsert inserts a new summary', async () => {
    await repo.upsert({
      thread_id: 't-1',
      summary: 'Initial summary',
      topics: ['vacation'],
      generated_at: 1000,
      message_count_at_generation: 5,
    })
    const fetched = await repo.getByThread('t-1')
    expect(fetched).toMatchObject({
      thread_id: 't-1',
      summary: 'Initial summary',
      topics: ['vacation'],
    })
  })

  it('upsert replaces existing summary for the same thread', async () => {
    await repo.upsert({
      thread_id: 't-1',
      summary: 'v1',
      topics: ['old'],
      generated_at: 1000,
      message_count_at_generation: 5,
    })
    await repo.upsert({
      thread_id: 't-1',
      summary: 'v2',
      topics: ['new'],
      generated_at: 2000,
      message_count_at_generation: 12,
    })

    const fetched = await repo.getByThread('t-1')
    expect(fetched).toMatchObject({
      summary: 'v2',
      topics: ['new'],
      generated_at: 2000,
      message_count_at_generation: 12,
    })
  })

  it('delete removes the summary', async () => {
    await repo.upsert({
      thread_id: 't-1',
      summary: 'x',
      topics: [],
      generated_at: 1000,
      message_count_at_generation: 1,
    })
    await repo.delete('t-1')
    expect(await repo.getByThread('t-1')).toBeNull()
  })
})
