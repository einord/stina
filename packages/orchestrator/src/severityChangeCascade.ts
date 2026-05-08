/**
 * Severity-change cascade handler — §06 table (lines 145–158).
 *
 * When an extension update changes a tool's declared severity, this module
 * applies the four-row transition table:
 *
 *   low|medium → high      : policies remain valid; user notified.
 *   → critical (any from)  : existing policies revoked; user notified.
 *   high|critical → low|medium : silent no-op (harmless drift per spec line 153).
 *   low ↔ medium           : silent no-op (below policy-able threshold).
 *
 * Transactionality (spec line 156):
 * The spec requires "manifest update + cascade + notification written
 * transactionally". V1 partially honors this: revoke + `memory_change` writes
 * happen inside `db.transaction(...)`, but the `emitEventInternal` thread
 * spawn happens AFTER the transaction commits. A failure between commit and
 * spawn leaves the policies revoked but no notification — acceptable v1
 * trade-off because rolling back revokes if notification fails is worse: the
 * user would have no way to know the runtime considers the policies obsolete.
 *
 * Awaiting emitEventInternal:
 * Severity change is a rare event (extension reload boundary). The await cost
 * is acceptable, and awaiting gives deterministic ordering for tests
 * (`recordSeen` runs after the notification thread exists). This is different
 * from degraded-mode's exit message, which is fire-and-forget because it can
 * accumulate on every success-after-failure cascade.
 *
 * In-flight tool calls:
 * A `high` tool call already executing when the cascade fires keeps its
 * already-stamped severity (resolved at gate time per `PersistedToolCall.severity`
 * doc). The cascade only affects FUTURE calls.
 *
 * Multi-user notification fan-out:
 * `emitEventInternal` spawns one thread, attributed via the apps'
 * `defaultUserId` resolution. In multi-user installs with policies from
 * multiple users for the affected tool, only `defaultUserId` gets the
 * notification thread; other users' `memory_change` entries land silently
 * in their activity log (discoverable via recap when that surface lands).
 * V2 may fan-out per-user.
 *
 * Future hookup — dream_pass_flag for first-observed undeclared severity:
 * When a tool is first seen with no declared severity (defaulted to 'medium'),
 * a one-time `dream_pass_flag` activity entry should fire for review per §08.
 * The `onToolSeverityObserved` hook (apps' wiring) is the right place to emit
 * it when `previous === null && rawSeverity === undefined`. Deferred because
 * the `flag_for_review` activity-log kind and recap surface don't exist yet.
 */

import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { AutoPolicy, MemoryChangeCascadedFrom, ToolSeverity } from '@stina/core'
import type { AutoPolicyRepository } from '@stina/autonomy/db'
import type { ActivityLogRepository } from '@stina/autonomy/db'
import { autoPolicies, activityLogEntries, type AutonomyDb } from '@stina/autonomy/db'
import type { ThreadTrigger, AppContent } from '@stina/core'

export interface EmitEventInternalInput {
  trigger: ThreadTrigger
  content: AppContent
  source?: { extension_id?: string; component?: string }
  title?: string
}

export interface SeverityChangeCascadeDeps {
  db: AutonomyDb
  policyRepo: AutoPolicyRepository
  activityLogRepo: ActivityLogRepository
  emitEventInternal: (input: EmitEventInternalInput) => Promise<{ thread_id: string }>
  logger: {
    warn: (msg: string, ctx?: Record<string, unknown>) => void
    info: (msg: string, ctx?: Record<string, unknown>) => void
  }
}

export interface SeverityChangeCascadeInput {
  extensionId: string
  toolId: string
  previous: ToolSeverity
  current: ToolSeverity
}

export interface SeverityChangeCascadeResult {
  /** Number of policies revoked. Only > 0 on → critical transitions. */
  policiesRevoked: number
  /** thread_id of the user-notification thread, if one was spawned. */
  notificationThreadId: string | null
}

/**
 * Apply the §06 severity-change table when a tool's severity changes across
 * process restarts.
 *
 * The caller is responsible for:
 * 1. Calling `snapshotRepo.compare(...)` BEFORE this function.
 * 2. Calling `snapshotRepo.recordSeen(...)` AFTER this function succeeds.
 *
 * @param deps - Injected dependencies (repos + emitEventInternal + logger).
 * @param input - The change details (extensionId, toolId, previous, current).
 */
export async function applySeverityChangeCascade(
  deps: SeverityChangeCascadeDeps,
  input: SeverityChangeCascadeInput
): Promise<SeverityChangeCascadeResult> {
  const { db, policyRepo, emitEventInternal, logger } = deps
  const { extensionId, toolId, previous, current } = input

  // Defensive guard — caller should not invoke when nothing changed.
  if (previous === current) {
    logger.warn('applySeverityChangeCascade called with no severity change — skipping', {
      extensionId,
      toolId,
      severity: current,
    })
    return { policiesRevoked: 0, notificationThreadId: null }
  }

  // ─── Lowering transitions — silent no-op ───────────────────────────────────
  // high|critical → low|medium: policies remain (over-specified but harmless per spec line 153).
  // critical → high: also a lowering (critical > high in severity scale).
  // low ↔ medium: below policy-able threshold; no awareness signal needed.
  const severityRank = { low: 0, medium: 1, high: 2, critical: 3 } as const
  if (severityRank[current] < severityRank[previous]) {
    logger.info('severity lowered — no cascade required', { extensionId, toolId, previous, current })
    return { policiesRevoked: 0, notificationThreadId: null }
  }

  // ─── Raising to critical — revoke policies + notify ───────────────────────
  // Applies for any → critical transition (low, medium, or high → critical).
  // Typically policies only exist for high tools (critical tools cannot be
  // policied per §02), but findByTool returning > 0 is handled correctly
  // regardless of origin severity.
  if (current === 'critical') {
    // Fetch policies before the transaction (async read; OK outside tx).
    const existingPolicies = await policyRepo.findByTool(toolId)

    if (existingPolicies.length > 0) {
      // Revoke + activity-log writes in a single synchronous SQLite transaction.
      // Per codebase convention: better-sqlite3 transactions are SYNC; use
      // .run() / .all() inside the callback, never await.
      const now = Date.now()
      db.transaction((tx) => {
        for (const policy of existingPolicies) {
          // Delete the policy row.
          tx.delete(autoPolicies).where(eq(autoPolicies.id, policy.id)).run()

          // Write a memory_change audit entry for each revoked policy.
          const cascadedFrom: MemoryChangeCascadedFrom = {
            kind: 'severity_change',
            tool_id: toolId,
            from: previous,
            to: current,
          }
          tx
            .insert(activityLogEntries)
            .values({
              id: nanoid(),
              kind: 'memory_change',
              severity: current,
              threadId: null,
              summary: `Auto-policy for tool "${toolId}" revoked due to severity change ${previous} → ${current}`,
              details: {
                previous: policy as unknown as Record<string, unknown>,
                cascaded_from: cascadedFrom as unknown as Record<string, unknown>,
              },
              createdAt: now,
              retentionDays: 365,
            })
            .run()
        }
      })
    }

    // Spawn notification thread AFTER the transaction commits.
    // See module JSDoc for the V1 transactionality trade-off.
    const N = existingPolicies.length
    const detail =
      N > 0
        ? `Tillägget ${extensionId} markerade verktyget ${toolId} som "kritiskt" — ${N} befintliga ${N === 1 ? 'autopolicy har' : 'autopolicyer har'} dragits tillbaka. Bundna stående instruktioner finns kvar men kräver din bekräftelse igen.`
        : `Tillägget ${extensionId} markerade verktyget ${toolId} som "kritiskt". Verktyget kan inte längre policyas. Inga befintliga policyer påverkades.`

    // emitEventInternal is awaited intentionally — see module JSDoc.
    // Source is omitted so emitEventInternal defaults to RUNTIME_EXTENSION_ID.
    // The extension_id field on the content body is the AFFECTED extension's id.
    const { thread_id } = await emitEventInternal({
      trigger: { kind: 'stina', reason: 'system_notice' },
      content: {
        kind: 'extension_status',
        extension_id: extensionId,
        status: 'severity_changed',
        detail,
      },
    })

    logger.info('severity → critical cascade complete', {
      extensionId,
      toolId,
      previous,
      current,
      policiesRevoked: N,
      notificationThreadId: thread_id,
    })

    return { policiesRevoked: N, notificationThreadId: thread_id }
  }

  // ─── Raising to high — policies stay, user notified ───────────────────────
  // low|medium → high: no policy changes; spawn awareness notification.
  if (current === 'high') {
    const detail = `Tillägget ${extensionId} har ändrat allvarlighetsgrad för ${toolId} till "hög". Befintliga autopolicyer fortsätter gälla.`

    // emitEventInternal is awaited intentionally — see module JSDoc.
    // Source is omitted so emitEventInternal defaults to RUNTIME_EXTENSION_ID.
    const { thread_id } = await emitEventInternal({
      trigger: { kind: 'stina', reason: 'system_notice' },
      content: {
        kind: 'extension_status',
        extension_id: extensionId,
        status: 'severity_changed',
        detail,
      },
    })

    logger.info('severity → high cascade complete (policies retained)', {
      extensionId,
      toolId,
      previous,
      current,
      notificationThreadId: thread_id,
    })

    return { policiesRevoked: 0, notificationThreadId: thread_id }
  }

  // Unreachable: all valid ToolSeverity values covered above.
  logger.warn('applySeverityChangeCascade reached unexpected branch', {
    extensionId,
    toolId,
    previous,
    current,
  })
  return { policiesRevoked: 0, notificationThreadId: null }
}
