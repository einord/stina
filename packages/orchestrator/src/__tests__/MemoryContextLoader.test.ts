import { describe, it, expect, beforeEach, vi } from 'vitest'
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
import { RecallProviderRegistry } from '@stina/memory'
import { ThreadRepository, threadsSchema } from '@stina/threads/db'
import type { Thread } from '@stina/core'
import type { RecallResult } from '@stina/core'
import {
  DefaultMemoryContextLoader,
  truncateResultContent,
  applyRecallSectionBudget,
  MAX_RECALL_RESULTS_PER_TURN,
  MAX_RECALL_SECTION_CHARS,
} from '../memory/MemoryContextLoader.js'

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

/** Helper to build a minimal RecallResult */
function makeResult(
  overrides: Partial<RecallResult> & { content: string; ref_id: string }
): RecallResult {
  return {
    source: 'extension',
    source_detail: 'test-ext',
    score: 1,
    ...overrides,
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

// ─── Recall provider tests (pure registry mocks, no worker threads) ────────────

describe('DefaultMemoryContextLoader — recall results', () => {
  let threadRepo: ThreadRepository
  let instructions: StandingInstructionRepository
  let facts: ProfileFactRepository

  beforeEach(() => {
    const { threadDb, memoryDb } = createDbs()
    threadRepo = new ThreadRepository(threadDb)
    instructions = new StandingInstructionRepository(memoryDb)
    facts = new ProfileFactRepository(memoryDb)
  })

  it('returns recall_results: [] when no registry is provided (back-compat)', async () => {
    const loader = new DefaultMemoryContextLoader(instructions, facts)
    const thread = await threadRepo.create({
      trigger: { kind: 'mail', extension_id: 'mail', mail_id: 'm-1' },
      title: 'mail',
      linkedEntities: [
        {
          kind: 'person',
          extension_id: 'mail',
          ref_id: 'alice@example.com',
          snapshot: { display: 'Alice' },
        },
      ],
    })

    const ctx = await loader.load(thread)
    expect(ctx.recall_results).toEqual([])
  })

  it('returns recall_results: [] when registry is empty', async () => {
    const registry = new RecallProviderRegistry()
    const loader = new DefaultMemoryContextLoader(instructions, facts, registry)
    const thread = await threadRepo.create({
      trigger: { kind: 'mail', extension_id: 'mail', mail_id: 'm-2' },
      title: 'mail',
      linkedEntities: [
        {
          kind: 'person',
          extension_id: 'mail',
          ref_id: 'alice@example.com',
          snapshot: { display: 'Alice' },
        },
      ],
    })

    const ctx = await loader.load(thread)
    expect(ctx.recall_results).toEqual([])
  })

  it('returns results from one stub provider, sorted by score descending', async () => {
    const registry = new RecallProviderRegistry()
    registry.register('people', async (query) => [
      makeResult({ content: `low: ${query.query}`, ref_id: 'p:low', score: 0.5 }),
      makeResult({ content: `high: ${query.query}`, ref_id: 'p:high', score: 0.9 }),
    ])

    const loader = new DefaultMemoryContextLoader(instructions, facts, registry)
    const thread = await threadRepo.create({
      trigger: { kind: 'mail', extension_id: 'mail', mail_id: 'm-3' },
      title: 'mail',
      linkedEntities: [
        {
          kind: 'person',
          extension_id: 'mail',
          ref_id: 'alice@example.com',
          snapshot: { display: 'Alice' },
        },
      ],
    })

    const ctx = await loader.load(thread)
    expect(ctx.recall_results.length).toBeGreaterThan(0)
    // Sorted by score descending
    const scores = ctx.recall_results.map((r) => r.score)
    expect(scores[0]).toBeGreaterThanOrEqual(scores[scores.length - 1]!)
    // High-score result comes first
    expect(ctx.recall_results[0]!.score).toBe(0.9)
  })

  it('merges results from two providers, both surface sorted by score', async () => {
    const registry = new RecallProviderRegistry()
    registry.register('ext-a', async () => [
      makeResult({ source_detail: 'ext-a', content: 'from a', ref_id: 'a:1', score: 0.7 }),
    ])
    registry.register('ext-b', async () => [
      makeResult({ source_detail: 'ext-b', content: 'from b', ref_id: 'b:1', score: 0.8 }),
    ])

    const loader = new DefaultMemoryContextLoader(instructions, facts, registry)
    const thread = await threadRepo.create({
      trigger: { kind: 'mail', extension_id: 'mail', mail_id: 'm-4' },
      title: 'mail',
      linkedEntities: [
        {
          kind: 'person',
          extension_id: 'mail',
          ref_id: 'alice@example.com',
          snapshot: { display: 'Alice' },
        },
      ],
    })

    const ctx = await loader.load(thread)
    const details = ctx.recall_results.map((r) => r.source_detail)
    expect(details).toContain('ext-a')
    expect(details).toContain('ext-b')
    // Sorted by score: ext-b (0.8) before ext-a (0.7)
    const bIdx = details.indexOf('ext-b')
    const aIdx = details.indexOf('ext-a')
    expect(bIdx).toBeLessThan(aIdx)
  })

  it('skips recall when entities have only snapshot.display and no ref_id (no provider noise from free-text)', async () => {
    const registry = new RecallProviderRegistry()
    const querySpy = vi.spyOn(registry, 'query')

    const loader = new DefaultMemoryContextLoader(instructions, facts, registry)
    // Fabricate a thread with one linked entity whose ref_id is empty but
    // snapshot.display is set. linked_facts WILL still be queried (display
    // is one of the subject keys for findBySubject) but recall must NOT be
    // called — snapshot.display is free-text and would yield noisy provider
    // results, per the v1 contract documented on loadRecallResults.
    const thread = await threadRepo.create({
      trigger: { kind: 'mail', extension_id: 'stina-ext-mail', mail_id: 'm-x' },
      title: 'display-only',
      linkedEntities: [
        {
          kind: 'person',
          extension_id: 'stina-ext-mail',
          ref_id: '',
          snapshot: { display: 'Some Sender', excerpt: 'subject' },
        },
      ],
    })

    const ctx = await loader.load(thread)
    expect(ctx.recall_results).toEqual([])
    expect(querySpy).not.toHaveBeenCalled()
  })

  it('does not call the registry when thread has no linked entities', async () => {
    const registry = new RecallProviderRegistry()
    const querySpy = vi.spyOn(registry, 'query')

    const loader = new DefaultMemoryContextLoader(instructions, facts, registry)
    const thread = await threadRepo.create({ trigger: { kind: 'user' }, title: 'user thread' })

    const ctx = await loader.load(thread)
    expect(ctx.recall_results).toEqual([])
    expect(querySpy).not.toHaveBeenCalled()
  })

  it('still returns standing instructions and linked facts when registry.query throws (registry-level failure)', async () => {
    const registry = new RecallProviderRegistry()
    vi.spyOn(registry, 'query').mockRejectedValue(new Error('registry boom'))

    await instructions.create({
      rule: 'do not panic',
      scope: { channels: ['all'] },
      created_by: 'user',
    })
    await facts.create({
      fact: 'Alice is cool',
      subject: 'alice@example.com',
      predicate: 'trait',
      created_by: 'user',
    })

    const loader = new DefaultMemoryContextLoader(instructions, facts, registry)
    const thread = await threadRepo.create({
      trigger: { kind: 'mail', extension_id: 'mail', mail_id: 'm-5' },
      title: 'mail',
      linkedEntities: [
        {
          kind: 'person',
          extension_id: 'mail',
          ref_id: 'alice@example.com',
          snapshot: { display: 'Alice' },
        },
      ],
    })

    const ctx = await loader.load(thread)
    // Registry failure does not block the loader
    expect(ctx.recall_results).toEqual([])
    // But standing instructions and facts still come back
    expect(ctx.active_instructions.map((i) => i.rule)).toContain('do not panic')
    expect(ctx.linked_facts.map((f) => f.fact)).toContain('Alice is cool')
  })

  it('caps results to MAX_RECALL_RESULTS_PER_TURN (15)', async () => {
    const registry = new RecallProviderRegistry()
    registry.register('heavy', async () =>
      Array.from({ length: 50 }, (_, i) =>
        makeResult({ content: `item ${i}`, ref_id: `id:${i}`, score: 50 - i })
      )
    )

    const loader = new DefaultMemoryContextLoader(instructions, facts, registry)
    const thread = await threadRepo.create({
      trigger: { kind: 'mail', extension_id: 'mail', mail_id: 'm-6' },
      title: 'mail',
      linkedEntities: [
        {
          kind: 'person',
          extension_id: 'mail',
          ref_id: 'alice@example.com',
          snapshot: { display: 'Alice' },
        },
      ],
    })

    const ctx = await loader.load(thread)
    expect(ctx.recall_results.length).toBeLessThanOrEqual(MAX_RECALL_RESULTS_PER_TURN)
  })

  it('dedupes results by (source_detail, ref_id) tuple — first occurrence wins', async () => {
    const registry = new RecallProviderRegistry()
    // Two entities that both match the same ref_id from the same provider
    registry.register('people', async (query) => [
      makeResult({
        source_detail: 'people',
        content: `note for ${query.query}`,
        ref_id: 'person:alice',
        score: 1,
      }),
    ])

    const loader = new DefaultMemoryContextLoader(instructions, facts, registry)
    const thread = await threadRepo.create({
      trigger: { kind: 'mail', extension_id: 'mail', mail_id: 'm-7' },
      title: 'mail',
      linkedEntities: [
        {
          kind: 'person',
          extension_id: 'mail',
          ref_id: 'alice@example.com',
          snapshot: { display: 'Alice' },
        },
        {
          kind: 'person',
          extension_id: 'mail',
          ref_id: 'alice.work@example.com',
          snapshot: { display: 'Alice Work' },
        },
      ],
    })

    const ctx = await loader.load(thread)
    // Deduped: two entities each return ref_id='person:alice' from 'people',
    // so only one result should survive
    const aliceResults = ctx.recall_results.filter(
      (r) => r.source_detail === 'people' && r.ref_id === 'person:alice'
    )
    expect(aliceResults.length).toBe(1)
  })
})

// ─── Pure-function unit tests for the token-budget helpers ────────────────────

describe('truncateResultContent', () => {
  it('returns the content unchanged when ≤ 500 chars', () => {
    const content = 'x'.repeat(500)
    expect(truncateResultContent(content)).toBe(content)
  })

  it('truncates to 499 chars + … when content exceeds 500 chars', () => {
    const content = 'a'.repeat(600)
    const result = truncateResultContent(content)
    expect(result.length).toBe(500)
    expect(result.endsWith('…')).toBe(true)
    expect(result.slice(0, 499)).toBe('a'.repeat(499))
  })

  it('handles exactly 501 chars', () => {
    const content = 'b'.repeat(501)
    const result = truncateResultContent(content)
    expect(result.length).toBe(500)
    expect(result.endsWith('…')).toBe(true)
  })
})

describe('applyRecallSectionBudget', () => {
  it('returns all results when total chars is within budget', () => {
    const results: RecallResult[] = [
      makeResult({ source_detail: 'ext', content: 'short', ref_id: 'r1' }),
      makeResult({ source_detail: 'ext', content: 'also short', ref_id: 'r2' }),
    ]
    expect(applyRecallSectionBudget(results)).toEqual(results)
  })

  it('stops accumulating once the budget would be exceeded', () => {
    // Each entry: source_detail (3) + 2 (': ') + content.length
    // Budget is MAX_RECALL_SECTION_CHARS = 8000
    // Make entries that are 1000 chars each (content = 995 chars: 3 + 2 + 995 = 1000)
    const bigContent = 'x'.repeat(995)
    const results: RecallResult[] = Array.from({ length: 20 }, (_, i) =>
      makeResult({ source_detail: 'ext', content: bigContent, ref_id: `r${i}` })
    )

    const kept = applyRecallSectionBudget(results)
    // 8 * 1000 = 8000 ≤ 8000, 9 * 1000 = 9000 > 8000 → should keep 8
    expect(kept.length).toBe(8)
  })

  it('returns empty array for empty input', () => {
    expect(applyRecallSectionBudget([])).toEqual([])
  })

  it('stops immediately if first result alone exceeds budget', () => {
    const hugeContent = 'z'.repeat(MAX_RECALL_SECTION_CHARS + 100)
    const results: RecallResult[] = [
      makeResult({ source_detail: 'ext', content: hugeContent, ref_id: 'r1' }),
    ]
    // source_detail(3) + 2 + content.length > budget → 0 results
    expect(applyRecallSectionBudget(results)).toEqual([])
  })
})
