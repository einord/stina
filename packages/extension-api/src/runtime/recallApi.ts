/**
 * Worker-side Recall API
 *
 * Manages the single registered recall provider handler for an extension worker.
 * Handles outbound registration/unregistration (worker→host via RequestMethod)
 * and inbound query dispatch (host→worker via recall-query-request message).
 *
 * Mirrors the storageApi.ts / secretsApi.ts pattern.
 */

import type { RecallAPI, RecallProviderHandler, RecallResult, Disposable } from '../types.js'
import type { WorkerToHostMessage } from '../messages.js'

/**
 * Minimal type for the postMessage function used to send to the host.
 */
type PostMessage = (message: WorkerToHostMessage) => void

/**
 * Minimal sendRequest type (worker → host request/response channel).
 */
type SendNotification = (method: string, payload: unknown) => void

/**
 * Slot tracking the current provider generation.
 * Only one provider is active at a time per extension worker.
 */
interface ProviderSlot {
  handler: RecallProviderHandler
  generation: number
}

/** Module-scope state: current provider slot (null when no provider registered). */
let currentSlot: ProviderSlot | null = null
/** Monotonically increasing generation counter. */
let nextGeneration = 0

/**
 * Create the RecallAPI instance exposed to extensions via `ctx.recall`.
 *
 * @param sendNotification - Function to send a fire-and-forget request to the host
 *   (used for recall.registerProvider and recall.unregisterProvider notifications).
 * @param postMessage - Raw postMessage used for recall-query-response messages.
 */
export function createRecallApi(
  sendNotification: SendNotification,
  postMessage: PostMessage
): RecallAPI {
  return {
    registerProvider(handler: RecallProviderHandler): Disposable {
      nextGeneration += 1
      const gen = nextGeneration
      currentSlot = { handler, generation: gen }

      // Notify host that this extension now has a recall provider registered.
      // Payload is empty — extensionId is implicit in the IPC channel.
      sendNotification('recall.registerProvider', {})

      return {
        dispose(): void {
          // Only unregister if this Disposable's generation still matches the
          // current slot. This prevents a stale Disposable from silently
          // unregistering a newer provider registered via a second call.
          if (currentSlot === null || currentSlot.generation !== gen) {
            // Stale dispose — no-op
            return
          }
          currentSlot = null
          sendNotification('recall.unregisterProvider', { generation: gen })
        },
      }
    },
  }
}

/**
 * Dispatch an incoming recall-query-request message to the registered handler.
 * Called by the runtime message router when the host sends a recall-query-request.
 *
 * @param requestId - Correlation id from the request, echoed back in the response.
 * @param query - The recall query to pass to the handler.
 * @param postMessage - Function to post the response back to the host.
 */
export async function handleRecallQueryRequest(
  requestId: string,
  query: unknown,
  postMessage: PostMessage
): Promise<void> {
  if (!currentSlot) {
    postMessage({
      type: 'recall-query-response',
      payload: {
        requestId,
        result: [],
        error: 'No recall provider registered',
      },
    })
    return
  }

  try {
    const result: RecallResult[] = await currentSlot.handler(query as Parameters<RecallProviderHandler>[0])
    postMessage({
      type: 'recall-query-response',
      payload: { requestId, result },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    postMessage({
      type: 'recall-query-response',
      payload: {
        requestId,
        result: [],
        error: errorMessage,
      },
    })
  }
}

/**
 * Reset module-scope state. Used only in tests.
 * @internal
 */
export function _resetRecallApiState(): void {
  currentSlot = null
  nextGeneration = 0
}
