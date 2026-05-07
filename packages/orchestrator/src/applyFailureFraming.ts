import { RUNTIME_EXTENSION_ID } from '@stina/core'
import type { ThreadRepository } from '@stina/threads/db'
import type { ActivityLogRepository } from '@stina/autonomy/db'

export interface FailureFramingDeps {
  threadRepo: ThreadRepository
  activityLogRepo: ActivityLogRepository
  logger: { warn: (msg: string, ctx?: Record<string, unknown>) => void }
}

/**
 * spec §04 failure mode — appends a system AppMessage + event_handled activity
 * log entry when the decision turn throws. Never throws itself.
 */
export async function applyFailureFraming(
  deps: FailureFramingDeps,
  args: { thread_id: string; error: unknown }
): Promise<void> {
  const { threadRepo, activityLogRepo, logger } = deps
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
        message: 'Jag kunde inte bearbeta denna händelse automatiskt — granska gärna.',
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
}
