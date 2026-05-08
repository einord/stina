/**
 * In-memory pub/sub notification dispatcher.
 *
 * One instance per host process (API or Electron main). Restart resets state —
 * acceptable for v1 (matches DegradedModeTracker pattern).
 *
 * Known v1 limitation: events that fire during a brief client disconnect are
 * lost (no buffering). Clients catch up via GET /notifications on reconnect.
 */

export interface NotificationEvent {
  thread_id: string
  /** User the notification belongs to. SSE bridge filters by request.user.id. */
  user_id: string
  title: string
  /**
   * Short preview snippet from the first normal message (or failure framing).
   * Capped at 140 codepoints.
   */
  preview: string
  /** Distinguishes Stina's first user-addressed reply from a failure-framing message. */
  kind: 'normal' | 'failure'
  /** Trigger kind from the thread (forward-compat for v2 per-trigger-kind suppression). */
  trigger_kind?: 'mail' | 'calendar' | 'scheduled' | 'user' | 'stina'
  /**
   * Extension that owns the trigger (mail/calendar only; absent for scheduled/user/stina).
   * Forward-compat for v2 per-extension suppression.
   */
  extension_id?: string
  /** Timestamp when the notification fired (= thread.notified_at). */
  notified_at: number
}

export type NotificationListener = (event: NotificationEvent) => void

/**
 * Process-global in-memory pub/sub dispatcher for notification events.
 *
 * Dispatch is synchronous — listeners must not return promises. One bad
 * subscriber is swallowed and must not block others.
 */
export class NotificationDispatcher {
  private listeners = new Set<NotificationListener>()

  /**
   * Subscribe to notification events.
   * @returns Disposable — call to unsubscribe.
   */
  subscribe(listener: NotificationListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Dispatch an event to all current subscribers.
   * Synchronous. Individual listener errors are swallowed.
   */
  dispatch(event: NotificationEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        // Swallow — one bad subscriber must not block others.
      }
    }
  }
}
