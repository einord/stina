import { and, eq } from 'drizzle-orm'
import type { ToolSeverity } from '@stina/core'
import { toolSeveritySnapshots, type AutonomyDb } from '../schema.js'

/**
 * Repository for the `tool_severity_snapshots` table.
 *
 * Tracks the last-seen resolved severity for each (extension, tool) pair so
 * the severity-change cascade handler can detect changes across process
 * restarts.
 *
 * READ (compare) and WRITE (recordSeen) are split intentionally. The caller
 * must invoke `compare` BEFORE running the cascade, and `recordSeen` AFTER
 * the cascade succeeds. If the process crashes between cascade and
 * `recordSeen`, the next boot re-runs the cascade (at-least-once semantics).
 * At-least-once duplicates on crash are preferable to silent permanent loss.
 *
 * See `docs/redesign-2026/06-autonomy.md` §Severity-change cascade for the
 * full design rationale.
 */
export class ToolSeveritySnapshotRepository {
  constructor(private db: AutonomyDb) {}

  /**
   * Read-only compare. Does NOT update the snapshot. Use this BEFORE running
   * the cascade.
   *
   * The snapshot stores runtime-resolved severity (undefined → 'medium'),
   * matching the producer's `?? 'medium'` gate semantics. Callers MUST
   * pre-resolve before calling.
   *
   * Returns:
   * - `previous`: the last-seen severity, or `null` on first observation.
   * - `current`: the provided severity (pass-through for convenience).
   * - `didChange`: `true` iff `previous !== null && previous !== current`.
   *   First observation is NOT a change.
   */
  async compare(
    extensionId: string,
    toolId: string,
    severity: ToolSeverity
  ): Promise<{
    previous: ToolSeverity | null
    current: ToolSeverity
    didChange: boolean
  }> {
    const rows = await this.db
      .select()
      .from(toolSeveritySnapshots)
      .where(
        and(
          eq(toolSeveritySnapshots.extensionId, extensionId),
          eq(toolSeveritySnapshots.toolId, toolId)
        )
      )
      .limit(1)

    const previous = rows[0]?.severity ?? null
    const didChange = previous !== null && previous !== severity

    return { previous, current: severity, didChange }
  }

  /**
   * Upsert the snapshot. Use this AFTER the cascade completes successfully.
   *
   * If the process crashes between cascade run and `recordSeen`, the next boot
   * sees the same `previous` and re-runs the cascade — `revoke` is a
   * delete-by-id operation (idempotent on already-revoked rows), `memory_change`
   * writes are append-only and may produce duplicate entries on crash;
   * notification spawn may also duplicate. Acceptable v1 trade-off: at-least-once
   * semantics on cascade actions, no missed notifications.
   *
   * @param now - optional unix ms timestamp; defaults to `Date.now()`
   */
  async recordSeen(
    extensionId: string,
    toolId: string,
    severity: ToolSeverity,
    now?: number
  ): Promise<void> {
    const lastSeenAt = now ?? Date.now()
    await this.db
      .insert(toolSeveritySnapshots)
      .values({ extensionId, toolId, severity, lastSeenAt })
      .onConflictDoUpdate({
        target: [toolSeveritySnapshots.extensionId, toolSeveritySnapshots.toolId],
        set: { severity, lastSeenAt },
      })
  }
}
