import { RUNTIME_EXTENSION_ID } from '@stina/core'
import type { ThreadRepository } from '@stina/threads/db'
import type { ActivityLogRepository } from '@stina/autonomy/db'
import type { DegradedModeTracker } from './degradedMode.js'
import { DEGRADED_MODE_FAILURE_THRESHOLD } from './degradedMode.js'
import type { NotificationDispatcher } from './notificationDispatcher.js'
import { extractExtensionId } from './notificationHelpers.js'

/**
 * Swedish failure-framing message displayed to the user.
 * Single source of truth — used in both the system AppMessage and the
 * notification preview so they always match.
 */
export const FAILURE_FRAMING_TEXT =
  'Jag kunde inte bearbeta denna händelse automatiskt — granska gärna.'

export interface FailureFramingDeps {
  threadRepo: ThreadRepository
  activityLogRepo: ActivityLogRepository
  logger: { warn: (msg: string, ctx?: Record<string, unknown>) => void }
  /**
   * Optional degraded-mode tracker (§04 lines 147–157).
   * When absent (e.g. in unit tests that don't care about degraded mode),
   * the tracker bookkeeping is skipped. Instantiate one per host and pass
   * the same instance to both applyFailureFraming and spawnTriggeredThread.
   */
  tracker?: DegradedModeTracker
  /**
   * Optional notification dispatcher. When set and framingOk is true and
   * suppressNotification is false, fires a failure notification.
   */
  notificationDispatcher?: NotificationDispatcher
  /**
   * The user ID to stamp on the notification event (for SSE per-user filtering).
   * Required when notificationDispatcher is set. Defaults to ''.
   */
  notifyUserId?: string
}

/**
 * spec §04 failure mode — appends a system AppMessage + event_handled activity
 * log entry when the decision turn throws. Never throws itself.
 *
 * Returns `{ suppressNotification }` (forward-compatible — existing callers
 * discard the return value). The future notification step will read this field
 * to decide whether to fire an individual notification or defer to the aggregate.
 */
export async function applyFailureFraming(
  deps: FailureFramingDeps,
  args: { thread_id: string; error: unknown }
): Promise<{ suppressNotification: boolean }> {
  const { threadRepo, activityLogRepo, logger, tracker } = deps
  const { thread_id, error } = args

  const errorMessage = error instanceof Error ? error.message : String(error)
  const errorClass = error instanceof Error ? (error.name || 'Error') : 'UnknownError'

  // Step 1: append framing message. Gate on success (framingOk) before surfacing/lifting the gate.
  let framingOk = false
  try {
    await threadRepo.appendMessage({
      thread_id,
      author: 'app',
      visibility: 'normal',
      source: { extension_id: RUNTIME_EXTENSION_ID },
      content: {
        kind: 'system',
        message: FAILURE_FRAMING_TEXT,
      },
    })
    framingOk = true
  } catch (appendErr) {
    logger.warn('applyFailureFraming: failed to append system message', {
      thread_id,
      appendErr: appendErr instanceof Error ? appendErr.message : String(appendErr),
    })
  }

  // Step 2: mark surfaced — only if framing append succeeded.
  if (framingOk) {
    try {
      await threadRepo.markSurfaced(thread_id)
    } catch (surfaceErr) {
      logger.warn('applyFailureFraming: markSurfaced failed', {
        thread_id,
        surfaceErr: surfaceErr instanceof Error ? surfaceErr.message : String(surfaceErr),
      })
    }
  }

  // Step 3: lift the §04 gate — only if framing append succeeded (spec §04: gate stays closed if framing append failed).
  // Does NOT gate on markSurfaced succeeding — surfacing is recoverable.
  if (framingOk) {
    try {
      await threadRepo.markFirstTurnCompleted(thread_id)
    } catch (gateErr) {
      logger.warn('applyFailureFraming: markFirstTurnCompleted failed', {
        thread_id,
        gateErr: gateErr instanceof Error ? gateErr.message : String(gateErr),
      })
    }
  }

  // Step 4: activity log — always attempted regardless of framing outcome.
  try {
    await activityLogRepo.append({
      kind: 'event_handled',
      thread_id,
      summary: 'Decision turn failed for event-triggered thread',
      details: { failure: true, error_message: errorMessage, error_class: errorClass },
    })
  } catch (logErr) {
    logger.warn('applyFailureFraming: failed to write activity log entry', {
      thread_id,
      logErr: logErr instanceof Error ? logErr.message : String(logErr),
    })
  }

  logger.warn('emitEvent: decision turn failed — failure framing applied', {
    thread_id,
    error_message: errorMessage,
    error_class: errorClass,
  })

  // Step 5: degraded-mode bookkeeping.
  let suppressNotification = false
  if (tracker) {
    const trackerResult = tracker.recordFailure({
      threadId: thread_id,
      errorClass,
      now: Date.now(),
    })
    suppressNotification = trackerResult.suppressNotification

    if (trackerResult.enteredDegraded && trackerResult.anchorThreadId) {
      const anchorThreadId = trackerResult.anchorThreadId
      // Format the window start time as Swedish locale HH:MM.
      const sinceTime = new Date(trackerResult.windowFirstFailureAt).toLocaleString('sv-SE', {
        hour: '2-digit',
        minute: '2-digit',
      })

      // Append degraded-mode entry message on the anchor thread (= this thread).
      try {
        await threadRepo.appendMessage({
          thread_id: anchorThreadId,
          author: 'app',
          visibility: 'normal',
          source: { extension_id: RUNTIME_EXTENSION_ID },
          content: {
            kind: 'extension_status',
            extension_id: RUNTIME_EXTENSION_ID,
            status: 'degraded_mode_entered',
            detail: `Stina har problem att bearbeta händelser. ${DEGRADED_MODE_FAILURE_THRESHOLD} händelser sedan ${sinceTime} väntar på granskning.`,
          },
        })
      } catch (entryMsgErr) {
        logger.warn('applyFailureFraming: failed to append degraded_mode_entered message', {
          anchor_thread_id: anchorThreadId,
          entryMsgErr: entryMsgErr instanceof Error ? entryMsgErr.message : String(entryMsgErr),
        })
      }

      // Write a transition activity log entry.
      try {
        await activityLogRepo.append({
          kind: 'event_handled',
          thread_id: anchorThreadId,
          summary: 'Degraded mode entered',
          details: {
            degraded_mode_transition: 'entered',
            error_class: errorClass,
            anchor_thread_id: anchorThreadId,
            threshold_count: DEGRADED_MODE_FAILURE_THRESHOLD,
          },
        })
      } catch (transitionLogErr) {
        logger.warn('applyFailureFraming: failed to write degraded_mode transition log entry', {
          anchor_thread_id: anchorThreadId,
          transitionLogErr:
            transitionLogErr instanceof Error ? transitionLogErr.message : String(transitionLogErr),
        })
      }
    }
  }

  // Step 6: notification dispatch — placed AFTER all degraded-mode bookkeeping,
  // BEFORE return. Only fires when framingOk (framing append succeeded) AND
  // suppressNotification is false AND a dispatcher was provided.
  const dispatcher = deps.notificationDispatcher
  if (framingOk && !suppressNotification && dispatcher) {
    try {
      const didWrite = await threadRepo.markNotified(thread_id)
      if (didWrite) {
        const thread = await threadRepo.getById(thread_id)
        dispatcher.dispatch({
          thread_id,
          user_id: deps.notifyUserId ?? '',
          title: thread?.title ?? '',
          preview: FAILURE_FRAMING_TEXT,
          kind: 'failure',
          trigger_kind: thread?.trigger?.kind,
          extension_id: thread ? extractExtensionId(thread.trigger) : undefined,
          notified_at: Date.now(),
        })
      }
    } catch (notifErr) {
      logger.warn('applyFailureFraming: notification dispatch failed', {
        thread_id,
        err: notifErr instanceof Error ? notifErr.message : String(notifErr),
      })
    }
  }

  return { suppressNotification }
}

