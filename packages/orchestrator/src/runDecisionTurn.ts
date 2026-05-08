import type { ThreadRepository } from '@stina/threads/db'
import type { Message, StinaMessage } from '@stina/core'
import { cannedStubProducer, type DecisionTurnProducer } from './producers/canned.js'
import { emptyMemoryContextLoader, type MemoryContextLoader } from './memory/MemoryContextLoader.js'
import type { TurnStreamListener } from './streamEvents.js'
import { normalizeClosingAction } from './closingActionNormalization.js'
import type { NotificationDispatcher } from './notificationDispatcher.js'
import { extractExtensionId, makePreview } from './notificationHelpers.js'

export interface RunDecisionTurnInput {
  threadId: string
  threadRepo: ThreadRepository
  /**
   * Loader for the §03 thread-start memory context (active standing
   * instructions + profile facts matching linked entities). Defaults to a
   * null loader that returns empty memory — sufficient for tests focused on
   * orchestration mechanics. Pass `DefaultMemoryContextLoader` in production.
   */
  memoryLoader?: MemoryContextLoader
  /**
   * Producer that synthesises Stina's reply. Defaults to the canned stub
   * producer; pass a real producer once the provider integration lands.
   */
  producer?: DecisionTurnProducer
  /**
   * Optional sink for turn-level stream events (`content_delta`,
   * `message_appended`, `done`, `error`). When provided, deltas from the
   * producer are forwarded through, the appended Stina message is announced
   * after persistence, and a final `done` (or `error` on failure) closes
   * the stream. Pass-through plumbing — the orchestrator does not own the
   * transport.
   */
  onStreamEvent?: TurnStreamListener
  /**
   * Optional notification dispatcher. When set, the orchestrator dispatches
   * a notification event on the first normal-visibility turn, gated on
   * `notifyOnSurface === true` AND `markNotified` actually writing (monotonic).
   */
  notificationDispatcher?: NotificationDispatcher
  /**
   * Whether to fire a notification for this turn. Should be `true` for
   * event-triggered callsites (emitThreadEvent, emitEventInternal) and
   * `false` (or omitted) for user-initiated paths (POST /threads,
   * POST /threads/:id/messages). Default: false.
   *
   * Rationale: the user is already in the thread when they initiate a turn,
   * so a browser notification + bell badge for their own reply is noise.
   * Spec §04 line 161 frames notifications around first-surfacing to a user
   * who wasn't watching.
   */
  notifyOnSurface?: boolean
  /**
   * The user ID to stamp on the notification event (for SSE per-user filtering).
   * Required when notifyOnSurface is true and notificationDispatcher is set.
   * Defaults to empty string (safe no-op since threads are single-user in v1).
   */
  notifyUserId?: string
  /**
   * Optional logger for notification dispatch warnings.
   */
  logger?: { warn: (msg: string, ctx?: Record<string, unknown>) => void }
}

export interface RunDecisionTurnResult {
  thread_id: string
  message: StinaMessage
  /** True iff the thread became surfaced (or already was) after this turn. */
  surfaced: boolean
}

/**
 * Run a single decision turn on a thread.
 *
 * Steps:
 *   1. Load the thread (404 surfaces as a thrown Error — the route layer maps it).
 *   2. Load the message timeline as the producer's context (silent messages
 *      included so the producer sees the full audit trail).
 *   3. Invoke the producer to get a {visibility, content} reply.
 *   4. Append the reply as a 'stina'-authored message.
 *   5. If the reply is normal-visibility, mark the thread surfaced (idempotent).
 *
 * Tool calls and memory writes are out of scope for the v1 stub — adding them
 * extends `DecisionTurnContext` and `DecisionTurnOutput` without changing this
 * orchestration shape.
 */
export async function runDecisionTurn(input: RunDecisionTurnInput): Promise<RunDecisionTurnResult> {
  const {
    threadId,
    threadRepo,
    producer = cannedStubProducer,
    memoryLoader = emptyMemoryContextLoader,
    onStreamEvent,
    notificationDispatcher,
    notifyOnSurface = false,
    notifyUserId = '',
    logger,
  } = input

  try {
    const thread = await threadRepo.getById(threadId)
    if (!thread) {
      throw new Error(`Thread not found: ${threadId}`)
    }
    if (thread.status === 'archived') {
      throw new Error(`Cannot run decision turn on archived thread: ${threadId}`)
    }

    const [messages, memory] = await Promise.all([
      threadRepo.listMessages(threadId, { includeSilent: true }),
      memoryLoader.load(thread),
    ])

    const rawOutput = await producer({
      thread,
      messages,
      memory,
      ...(onStreamEvent ? { onStreamEvent } : {}),
    })

    // Validate the closing action before persisting. Throws ClosingActionMalformedError
    // on malformed output (e.g. normal-visibility with no text and no tool_calls).
    // The throw propagates through the catch below, which emits the `error` stream event
    // and re-throws — letting spawnTriggeredThread's applyFailureFraming handle it.
    const output = normalizeClosingAction(rawOutput)

    const appended = (await threadRepo.appendMessage({
      thread_id: threadId,
      author: 'stina',
      visibility: output.visibility,
      content: output.content,
    })) as StinaMessage

    // markSurfaced and markFirstTurnCompleted are recoverable side-effects;
    // failures here must not undo the persisted Stina message.
    let surfaced = thread.surfaced_at !== null
    if (output.visibility === 'normal') {
      try {
        await threadRepo.markSurfaced(threadId)
        surfaced = true
      } catch {
        /* swallow */
      }

      // Notification on first surfacing — gated on:
      //   (a) caller opted in via notifyOnSurface (event-triggered paths only)
      //   (b) markNotified actually wrote (monotonic — false on re-call).
      // When dispatcher is absent OR notifyOnSurface is false, no notification
      // fires (back-compat for tests + correct user-initiated semantics).
      if (notificationDispatcher && notifyOnSurface) {
        try {
          const didWrite = await threadRepo.markNotified(threadId)
          if (didWrite) {
            const preview = typeof output.content === 'object' && 'text' in output.content && typeof output.content.text === 'string'
              ? makePreview(output.content.text)
              : ''
            notificationDispatcher.dispatch({
              thread_id: threadId,
              user_id: notifyUserId,
              title: thread.title,
              preview,
              kind: 'normal',
              trigger_kind: thread.trigger.kind,
              extension_id: extractExtensionId(thread.trigger),
              notified_at: Date.now(),
            })
          }
        } catch (notifErr) {
          logger?.warn('runDecisionTurn: notification dispatch failed', {
            threadId,
            err: notifErr instanceof Error ? notifErr.message : String(notifErr),
          })
        }
      }
    }
    try {
      await threadRepo.markFirstTurnCompleted(threadId)
    } catch {
      /* swallow */
    }

    onStreamEvent?.({ type: 'message_appended', message: appended })
    onStreamEvent?.({ type: 'done' })

    return {
      thread_id: threadId,
      message: appended,
      surfaced,
    }
  } catch (err) {
    onStreamEvent?.({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

// Re-exported here so single-file consumers don't need a barrel import.
export type { Message }
