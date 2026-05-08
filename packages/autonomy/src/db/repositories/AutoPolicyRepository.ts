import { and, eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { AutoPolicy, PolicyScope, ThreadTrigger } from '@stina/core'
import { autoPolicies, type AutonomyDb } from '../schema.js'

export interface CreateAutoPolicyInput {
  tool_id: string
  scope: PolicyScope
  source_thread_id?: string | null
  approval_count?: number
  created_by_suggestion?: boolean
}

/**
 * Repository for AutoPolicy.
 *
 * The §02 auto-policy creation guard is enforced at the runtime/orchestrator
 * layer — this repository's `create` does not validate trigger context. The
 * runtime checks the source thread's trigger.kind and routes through
 * `createGuarded` (below) when the call originates from a non-user-triggered
 * thread.
 *
 * `critical`-severity tools cannot be auto-policied (§02). This is enforced
 * by `createGuarded` when given a tool's severity.
 */
export class AutoPolicyRepository {
  constructor(private db: AutonomyDb) {}

  async create(input: CreateAutoPolicyInput): Promise<AutoPolicy> {
    const now = Date.now()
    const row = {
      id: nanoid(),
      toolId: input.tool_id,
      scope: input.scope,
      mode: 'inform' as const,
      createdAt: now,
      sourceThreadId: input.source_thread_id ?? null,
      approvalCount: input.approval_count ?? 0,
      createdBySuggestion: input.created_by_suggestion ?? false,
    }
    await this.db.insert(autoPolicies).values(row)
    return rowToPolicy(row)
  }

  /**
   * Guarded creation that enforces the §02 / §06 invariants:
   *
   * 1. `critical`-severity tools cannot be auto-policied (§02).
   * 2. Policies in non-user-triggered threads require interactive approval
   *    (the orchestrator passes `interactiveApproval: true` once the user
   *    has explicitly accepted via the thread itself or via the
   *    suggestions surface).
   *
   * Throws on violation.
   */
  async createGuarded(
    input: CreateAutoPolicyInput,
    context: {
      toolSeverity: 'low' | 'medium' | 'high' | 'critical'
      sourceTriggerKind: ThreadTrigger['kind']
      interactiveApproval: boolean
    }
  ): Promise<AutoPolicy> {
    if (context.toolSeverity === 'critical') {
      throw new Error(
        `Cannot create auto-policy for critical-severity tool ${input.tool_id}: ` +
          `critical actions never auto-policy per §02.`
      )
    }
    if (context.sourceTriggerKind !== 'user' && !context.interactiveApproval) {
      throw new Error(
        `Cannot create auto-policy in a non-user-triggered thread without ` +
          `interactive user approval per §02 auto-policy creation guard.`
      )
    }
    return this.create(input)
  }

  async getById(id: string): Promise<AutoPolicy | null> {
    const rows = await this.db.select().from(autoPolicies).where(eq(autoPolicies.id, id)).limit(1)
    return rows[0] ? rowToPolicy(rows[0]) : null
  }

  /**
   * Find policies for a given tool. Used by the approval gate on every tool
   * call — this is the hottest query in the autonomy layer, so the
   * tool_id index in the migration is required.
   */
  async findByTool(toolId: string): Promise<AutoPolicy[]> {
    const rows = await this.db.select().from(autoPolicies).where(eq(autoPolicies.toolId, toolId))
    return rows.map(rowToPolicy)
  }

  /**
   * Find policies bound to a specific standing instruction. Used by the
   * cascade revoker when an instruction expires.
   */
  async findByInstruction(standingInstructionId: string): Promise<AutoPolicy[]> {
    const rows = await this.db
      .select()
      .from(autoPolicies)
      .where(sql`json_extract(${autoPolicies.scope}, '$.standing_instruction_id') = ${standingInstructionId}`)
    return rows.map(rowToPolicy)
  }

  async listAll(): Promise<AutoPolicy[]> {
    const rows = await this.db.select().from(autoPolicies).orderBy(autoPolicies.createdAt)
    return rows.map(rowToPolicy)
  }

  async incrementApprovalCount(id: string): Promise<void> {
    await this.db
      .update(autoPolicies)
      .set({ approvalCount: sql`${autoPolicies.approvalCount} + 1` })
      .where(eq(autoPolicies.id, id))
  }

  async revoke(id: string): Promise<void> {
    await this.db.delete(autoPolicies).where(eq(autoPolicies.id, id))
  }

  /**
   * Revoke all policies for a given tool and return the deleted rows.
   *
   * **Not currently called by the §06 severity-change cascade** — that
   * cascade needs to write the revokes inside a synchronous `db.transaction`
   * (better-sqlite3's transaction callback is sync-only), and async repo
   * methods like this one cannot be awaited inside it. The cascade therefore
   * inlines `tx.delete(autoPolicies).where(...).run()` directly. This async
   * convenience method is exposed for future cascade consumers — extension
   * uninstall (§06 line 154) is the next planned caller — that don't have
   * the same sync-tx constraint, and so they can revoke + receive the
   * deleted rows in one call without a separate `findByTool` lookup.
   *
   * `revoke` (single-id) semantics are unchanged.
   */
  async revokeAllForTool(toolId: string): Promise<AutoPolicy[]> {
    const existing = await this.findByTool(toolId)
    for (const policy of existing) {
      await this.db.delete(autoPolicies).where(eq(autoPolicies.id, policy.id))
    }
    return existing
  }

  /**
   * Cascade-revoke all policies bound to a standing instruction (used when
   * the instruction expires or is deleted; per §06).
   */
  async revokeByInstruction(standingInstructionId: string): Promise<number> {
    const result = await this.db
      .delete(autoPolicies)
      .where(
        sql`json_extract(${autoPolicies.scope}, '$.standing_instruction_id') = ${standingInstructionId}`
      )
    return result.changes ?? 0
  }
}

interface PolicyRow {
  id: string
  toolId: string
  scope: PolicyScope
  mode: 'inform'
  createdAt: number
  sourceThreadId: string | null
  approvalCount: number
  createdBySuggestion: boolean
}

function rowToPolicy(row: PolicyRow): AutoPolicy {
  return {
    id: row.id,
    tool_id: row.toolId,
    scope: row.scope,
    mode: row.mode,
    created_at: row.createdAt,
    source_thread_id: row.sourceThreadId,
    approval_count: row.approvalCount,
    created_by_suggestion: row.createdBySuggestion,
  }
}

void and
