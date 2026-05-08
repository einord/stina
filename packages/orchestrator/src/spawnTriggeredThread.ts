import { RUNTIME_EXTENSION_ID } from '@stina/core'
import type { ThreadTrigger, AppContent } from '@stina/core'
import type { ThreadRepository } from '@stina/threads/db'
import { deriveTitleFromAppContent, deriveLinkedEntities } from '@stina/threads'
import type { ActivityLogRepository } from '@stina/autonomy/db'
import type { MemoryContextLoader } from './memory/MemoryContextLoader.js'
import type { DecisionTurnProducer } from './producers/canned.js'
import { runDecisionTurn } from './runDecisionTurn.js'
import { applyFailureFraming } from './applyFailureFraming.js'
import type { DegradedModeTracker } from './degradedMode.js'
import type { NotificationDispatcher } from './notificationDispatcher.js'

/**
 * Input for spawning a triggered thread. Accepts the full `ThreadTrigger` and
 * `AppContent` unions — including `kind: 'stina'` triggers and `kind: 'system'`
 * content — so both the public extension path (after host validation) and the
 * runtime-internal path (`emitEventInternal`, see §04 line 49) can use the same
 * pipeline.
 *
 * `source` is REQUIRED here. The public path stamps it from the host's
 * authoritative extensionId; the internal path stamps `RUNTIME_EXTENSION_ID`.
 * Use the app-level `emitEventInternal` wrapper to get the default-RUNTIME_EXTENSION_ID
 * behaviour with optional source override.
 */
export interface SpawnTriggeredThreadInput {
  trigger: ThreadTrigger
  content: AppContent
  source: { extension_id: string; component?: string }
  /**
   * Optional explicit title. When provided, overrides the title derived from
   * the content via `deriveTitleFromAppContent`. Useful for runtime callers
   * (welcome, recap, dream-pass) where the content-derived default is awkward.
   */
  title?: string
}

/**
 * Dependencies injected into `spawnTriggeredThread`. Mirrors the pattern used
 * by `applyFailureFraming` so a single deps object can be constructed once and
 * reused across calls.
 */
export interface SpawnTriggeredThreadDeps {
  threadRepo: ThreadRepository
  activityLogRepo: ActivityLogRepository
  memoryLoader?: MemoryContextLoader
  producer?: DecisionTurnProducer
  logger: { warn: (msg: string, ctx?: Record<string, unknown>) => void }
  /**
   * Optional degraded-mode tracker (§04 lines 147–157).
   * When absent (e.g. in unit tests that don't care about degraded mode),
   * the tracker bookkeeping is skipped. Pass the same instance that is
   * passed to applyFailureFraming.
   */
  tracker?: DegradedModeTracker
  /**
   * Optional notification dispatcher. When set, fires notifications on
   * first-surfacing turns via both runDecisionTurn and applyFailureFraming.
   */
  notificationDispatcher?: NotificationDispatcher
  /**
   * The user ID to stamp on notification events for SSE per-user filtering.
   * Required when notificationDispatcher is set.
   */
  notifyUserId?: string
}

/**
 * Create a triggered thread and run the decision turn.
 *
 * This is the single source of truth for the thread-create + appendMessage +
 * decision-turn + failure-framing pipeline. Both the public extension path
 * (via `EventsHandler.emitThreadEvent`) and the runtime-internal path
 * (`emitEventInternal`, §04 line 49 / acceptance line 204) delegate here.
 *
 * Lifecycle (per §04):
 *   1. Thread created with `status: 'active'`, `surfaced_at: null`.
 *   2. Initial AppMessage appended.
 *   3. Decision turn runs (success → `markFirstTurnCompleted` inside `runDecisionTurn`;
 *      failure → `applyFailureFraming` lifts the gate after framing append).
 *   4. Returns `{ thread_id }` — never throws (errors are framed in-thread).
 */
export async function spawnTriggeredThread(
  deps: SpawnTriggeredThreadDeps,
  input: SpawnTriggeredThreadInput
): Promise<{ thread_id: string }> {
  const { threadRepo, activityLogRepo, memoryLoader, producer, logger, tracker, notificationDispatcher, notifyUserId } = deps
  const { trigger, content, source } = input

  // Derive title and linked entities from content, unless an explicit title override was provided.
  const title = input.title ?? deriveTitleFromAppContent(content)
  const linkedEntities = deriveLinkedEntities({ trigger, content })

  const thread = await threadRepo.create({ trigger, title, linkedEntities })

  await threadRepo.appendMessage({
    thread_id: thread.id,
    author: 'app',
    visibility: 'normal',
    source,
    content,
  })

  try {
    await runDecisionTurn({
      threadId: thread.id,
      threadRepo,
      ...(memoryLoader ? { memoryLoader } : {}),
      ...(producer ? { producer } : {}),
      notificationDispatcher,
      notifyOnSurface: true,
      notifyUserId,
      logger,
    })

    // Record success for degraded-mode bookkeeping (§04 lines 154–155).
    // Placed immediately after runDecisionTurn succeeds, before return.
    // If runDecisionTurn throws, control goes to catch; recordSuccess is never reached on failure.
    if (tracker) {
      const successResult = tracker.recordSuccess({ threadId: thread.id, now: Date.now() })

      if (successResult.exitedDegraded && successResult.anchorThreadId) {
        const anchorThreadId = successResult.anchorThreadId

        // Append recovery message on the anchor thread — best-effort (swallow on error).
        try {
          await threadRepo.appendMessage({
            thread_id: anchorThreadId,
            author: 'app',
            visibility: 'normal',
            source: { extension_id: RUNTIME_EXTENSION_ID },
            content: {
              kind: 'extension_status',
              extension_id: RUNTIME_EXTENSION_ID,
              status: 'degraded_mode_exited',
              detail: `Återhämtning. ${successResult.aggregatedCount} händelser hanterades under perioden.`,
            },
          })
        } catch (exitMsgErr) {
          logger.warn('spawnTriggeredThread: failed to append degraded_mode_exited message', {
            anchor_thread_id: anchorThreadId,
            exitMsgErr: exitMsgErr instanceof Error ? exitMsgErr.message : String(exitMsgErr),
          })
        }

        // Write transition activity log entry — best-effort.
        try {
          await activityLogRepo.append({
            kind: 'event_handled',
            thread_id: anchorThreadId,
            summary: 'Degraded mode exited',
            details: {
              degraded_mode_transition: 'exited',
              anchor_thread_id: anchorThreadId,
              aggregated_count: successResult.aggregatedCount,
            },
          })
        } catch (exitLogErr) {
          logger.warn('spawnTriggeredThread: failed to write degraded_mode exit log entry', {
            anchor_thread_id: anchorThreadId,
            exitLogErr: exitLogErr instanceof Error ? exitLogErr.message : String(exitLogErr),
          })
        }
      }
    }
  } catch (err) {
    await applyFailureFraming(
      { threadRepo, activityLogRepo, logger, tracker, notificationDispatcher, notifyUserId },
      { thread_id: thread.id, error: err }
    )
  }

  return { thread_id: thread.id }
}
