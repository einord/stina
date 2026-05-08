import { and, eq, gte, isNull, lte, or, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { StandingInstruction, InstructionScope, InvalidationCondition } from '@stina/core'
import { standingInstructions, type MemoryDb } from '../schema.js'

export interface CreateStandingInstructionInput {
  rule: string
  scope: InstructionScope
  valid_from?: number
  valid_until?: number | null
  invalidate_on?: InvalidationCondition[]
  source_thread_id?: string | null
  created_by: 'user' | 'stina'
}

/**
 * Repository for StandingInstruction.
 *
 * §07 hard rule: dream-pass-origin code paths must assert created_by !== 'user'
 * before mutating content. This repository exposes both an unrestricted
 * mutator (for user-initiated edits) and a guarded one (`mutateAsDreamPass`)
 * that enforces the hard rule and rejects user-set content. Dream-pass
 * lifecycle metadata (auto-expiring valid_until, evaluating invalidate_on)
 * uses dedicated methods that are safe for any created_by — those are
 * *honoring user intent*, not overwrite.
 */
export class StandingInstructionRepository {
  constructor(private db: MemoryDb) {}

  async create(input: CreateStandingInstructionInput): Promise<StandingInstruction> {
    const now = Date.now()
    const row = {
      id: nanoid(),
      rule: input.rule,
      scope: input.scope,
      validFrom: input.valid_from ?? now,
      validUntil: input.valid_until ?? null,
      invalidateOn: input.invalidate_on ?? [],
      sourceThreadId: input.source_thread_id ?? null,
      createdAt: now,
      createdBy: input.created_by,
    }
    await this.db.insert(standingInstructions).values(row)
    return rowToInstruction(row)
  }

  async getById(id: string): Promise<StandingInstruction | null> {
    const rows = await this.db
      .select()
      .from(standingInstructions)
      .where(eq(standingInstructions.id, id))
      .limit(1)
    return rows[0] ? rowToInstruction(rows[0]) : null
  }

  /**
   * Active instructions at a given timestamp: valid_from <= at <= (valid_until ?? ∞).
   * This is what the §03 thread-start context loader uses.
   */
  async listActive(at: number = Date.now()): Promise<StandingInstruction[]> {
    const rows = await this.db
      .select()
      .from(standingInstructions)
      .where(
        and(
          lte(standingInstructions.validFrom, at),
          or(isNull(standingInstructions.validUntil), gte(standingInstructions.validUntil, at))
        )
      )
    return rows.map(rowToInstruction)
  }

  async listAll(): Promise<StandingInstruction[]> {
    const rows = await this.db.select().from(standingInstructions).orderBy(standingInstructions.createdAt)
    return rows.map(rowToInstruction)
  }

  /**
   * Update the rule text. Allowed for any created_by — this is the
   * user-driven edit path. Dream pass code paths must NOT call this method;
   * they should use `mutateAsDreamPass` which asserts created_by !== 'user'.
   */
  async updateRule(id: string, rule: string): Promise<void> {
    await this.db.update(standingInstructions).set({ rule }).where(eq(standingInstructions.id, id))
  }

  async updateScope(id: string, scope: InstructionScope): Promise<void> {
    await this.db.update(standingInstructions).set({ scope }).where(eq(standingInstructions.id, id))
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(standingInstructions).where(eq(standingInstructions.id, id))
  }

  /**
   * Honor `valid_until` — auto-expire when reached. Safe for any created_by:
   * we are honoring the user's own time bound, not overwriting content.
   * Returns the count of expired instructions.
   */
  async expirePast(now: number = Date.now()): Promise<number> {
    const result = await this.db
      .delete(standingInstructions)
      .where(
        and(
          sql`${standingInstructions.validUntil} IS NOT NULL`,
          lte(standingInstructions.validUntil, now)
        )
      )
    return result.changes ?? 0
  }

  /**
   * Guarded mutation path for dream-pass-origin code. Asserts that the target
   * instruction was created by 'stina' (not 'user') before delegating to the
   * provided mutator. Throws on user-set content. See §07 hard rule.
   */
  async mutateAsDreamPass(
    id: string,
    mutator: (current: StandingInstruction) => Promise<void> | void
  ): Promise<void> {
    const current = await this.getById(id)
    if (!current) {
      throw new Error(`StandingInstruction not found: ${id}`)
    }
    if (current.created_by === 'user') {
      throw new Error(
        `Dream pass attempted to mutate a user-set standing instruction: ${id}. ` +
          `User-set memories are immutable to the dream pass per §07 hard rules.`
      )
    }
    await mutator(current)
  }
}

interface InstructionRow {
  id: string
  rule: string
  scope: InstructionScope
  validFrom: number
  validUntil: number | null
  invalidateOn: InvalidationCondition[]
  sourceThreadId: string | null
  createdAt: number
  createdBy: 'user' | 'stina'
}

function rowToInstruction(row: InstructionRow): StandingInstruction {
  return {
    id: row.id,
    rule: row.rule,
    scope: row.scope,
    valid_from: row.validFrom,
    valid_until: row.validUntil,
    invalidate_on: row.invalidateOn,
    source_thread_id: row.sourceThreadId,
    created_at: row.createdAt,
    created_by: row.createdBy,
  }
}
