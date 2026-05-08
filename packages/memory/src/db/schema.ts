import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { InstructionScope, InvalidationCondition } from '@stina/core'

/**
 * Standing instructions table — see docs/redesign-2026/02-data-model.md
 * §Standing instruction.
 *
 * Lifecycle: created_by 'user' content is immutable to dream pass; created_by
 * 'stina' content may be edited or expired by dream pass (with audit trail).
 * The runtime asserts created_by !== 'user' before any dream-pass-origin
 * mutation (per §07).
 */
export const standingInstructions = sqliteTable(
  'standing_instructions',
  {
    id: text('id').primaryKey(),
    rule: text('rule').notNull(),
    scope: text('scope', { mode: 'json' }).notNull().$type<InstructionScope>(),
    validFrom: integer('valid_from').notNull(),
    /** null = indefinite */
    validUntil: integer('valid_until'),
    invalidateOn: text('invalidate_on', { mode: 'json' })
      .notNull()
      .default('[]')
      .$type<InvalidationCondition[]>(),
    sourceThreadId: text('source_thread_id'),
    createdAt: integer('created_at').notNull(),
    createdBy: text('created_by').notNull().$type<'user' | 'stina'>(),
  },
  (table) => ({
    validityIdx: index('idx_standing_instructions_validity').on(table.validFrom, table.validUntil),
    createdByIdx: index('idx_standing_instructions_created_by').on(table.createdBy, table.createdAt),
  })
)

/**
 * Profile facts table — see docs/redesign-2026/02-data-model.md §Profile fact.
 *
 * Conflict resolution (per §03):
 * - memory ↔ memory: more recent last_referenced_at wins; tie-break by
 *   created_by ('user' beats 'stina', non-dream-pass beats dream-pass)
 * - memory ↔ extension: extension wins
 * - memory ↔ user: user wins immediately, memory is updated
 */
export const profileFacts = sqliteTable(
  'profile_facts',
  {
    id: text('id').primaryKey(),
    fact: text('fact').notNull(),
    subject: text('subject').notNull(),
    predicate: text('predicate').notNull(),
    sourceThreadId: text('source_thread_id'),
    lastReferencedAt: integer('last_referenced_at').notNull(),
    createdAt: integer('created_at').notNull(),
    createdBy: text('created_by').notNull().$type<'user' | 'stina'>(),
  },
  (table) => ({
    subjectPredicateIdx: index('idx_profile_facts_subject_predicate').on(table.subject, table.predicate),
    lastReferencedIdx: index('idx_profile_facts_last_referenced').on(table.lastReferencedAt),
  })
)

/**
 * Thread summaries table — see docs/redesign-2026/02-data-model.md §Thread
 * summary. Internal to the recall implementation; not surfaced as a "memory"
 * type per §03.
 */
export const threadSummaries = sqliteTable(
  'thread_summaries',
  {
    threadId: text('thread_id').primaryKey(),
    summary: text('summary').notNull(),
    topics: text('topics', { mode: 'json' }).notNull().default('[]').$type<string[]>(),
    generatedAt: integer('generated_at').notNull(),
    messageCountAtGeneration: integer('message_count_at_generation').notNull(),
  },
  (table) => ({
    generatedIdx: index('idx_thread_summaries_generated').on(table.generatedAt),
  })
)

export const memorySchema = { standingInstructions, profileFacts, threadSummaries }

export type MemoryDb = BetterSQLite3Database<typeof memorySchema>
