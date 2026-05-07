/**
 * Degraded-mode cascade defense (§04 lines 147–157).
 *
 * Tracks consecutive same-class failures on event-triggered decision turns and
 * transitions the runtime into/out of "degraded mode" when the threshold is
 * reached. In-memory state only — a restart resets the tracker (v1 known
 * limitation: a degraded-mode entry in flight when the host restarts is
 * forgotten; the next failure starts a fresh window).
 *
 * v1 is single-user; no userId parameter on the API. One tracker instance per
 * host. TODO: multi-user wiring when that becomes a real path — the API will
 * need a userId key to maintain per-user state.
 *
 * Usage: instantiate once per app host and inject into applyFailureFraming and
 * spawnTriggeredThread deps. Each test should instantiate its own fresh tracker
 * — do NOT use a module-level singleton.
 */

/** Trigger threshold: consecutive same-class failures within the window. */
export const DEGRADED_MODE_FAILURE_THRESHOLD = 5

/** Window length in milliseconds (60 seconds). */
export const DEGRADED_MODE_WINDOW_MS = 60_000

export interface RecordFailureResult {
  /** True iff this failure is the one that tripped the threshold (transition normal → degraded). */
  enteredDegraded: boolean
  /** Whether the runtime is in degraded mode AFTER this failure (true on entry and during). */
  inDegraded: boolean
  /** Anchor thread id — set when in degraded mode, equal to the threshold-tripping thread (the 5th failure). Null when not in degraded mode. */
  anchorThreadId: string | null
  /** Timestamp of the first failure in the current window (for "since HH:MM" in the entry message). Returned on every call. */
  windowFirstFailureAt: number
  /** True iff the runtime should suppress an individual notification for this thread (= aggregate it). True on entry and during. */
  suppressNotification: boolean
}

export interface RecordSuccessResult {
  /** True iff this success transitions degraded → normal. */
  exitedDegraded: boolean
  /** When exiting, the anchor thread to post the recovery message on. Null otherwise. */
  anchorThreadId: string | null
  /** When exiting, total failures aggregated during the entry (including the threshold-tripping one). */
  aggregatedCount: number
}

/**
 * Tracks consecutive failure windows and degraded-mode state for the cascade
 * defense mechanism (§04 lines 147–157).
 *
 * Invariants:
 * - Outside degraded mode: only same-class consecutive failures count toward entry.
 *   A different error class resets the consecutive counter (known limitation: two
 *   interleaved error classes never trigger entry even if the system is clearly broken
 *   — spec §04 line 151 requires "same error class").
 * - Once inDegradedMode === true: ALL failures aggregate regardless of error class.
 *   Exit only on the first successful decision turn.
 * - Anchor = the threshold-tripping thread (the 5th failure), NOT the first failure.
 *   Failures 1–4 are not yet in degraded mode at the time they fire.
 * - Window inclusivity: `now - windowFirstFailureAt <= DEGRADED_MODE_WINDOW_MS`
 *   (inclusive at exactly 60 000 ms).
 */
export class DegradedModeTracker {
  /** The error class currently being counted outside of degraded mode. */
  private currentErrorClass: string | null = null
  /** Timestamp of the first failure in the current consecutive window. */
  private windowFirstFailureAt = 0
  /** Consecutive same-class failures in the current window (outside degraded mode). */
  private consecutiveCount = 0
  /** True once the threshold has been tripped. */
  private inDegradedMode = false
  /** Set on entry — the thread_id of the threshold-tripping failure (failure #5). */
  private anchorThreadId: string | null = null
  /** Failures handled while in degraded mode, including the threshold-tripping one. */
  private aggregatedCount = 0
  /** Timestamp of the threshold-tripping failure (recorded for internal bookkeeping). */
  private entryAt: number | null = null

  /**
   * Record a decision-turn failure. Call synchronously in applyFailureFraming.
   *
   * @param input.threadId - The thread that failed.
   * @param input.errorClass - The error's class name (error.name).
   * @param input.now - Current timestamp in milliseconds (injectable for testing).
   */
  recordFailure(input: { threadId: string; errorClass: string; now: number }): RecordFailureResult {
    const { threadId, errorClass, now } = input

    // --- Already in degraded mode: aggregate all failures regardless of class ---
    if (this.inDegradedMode) {
      this.aggregatedCount++
      return {
        enteredDegraded: false,
        inDegraded: true,
        anchorThreadId: this.anchorThreadId,
        windowFirstFailureAt: this.windowFirstFailureAt,
        suppressNotification: true,
      }
    }

    // --- Outside degraded mode: same-class consecutive counting ---

    const sameClass = errorClass === this.currentErrorClass
    const withinWindow =
      this.consecutiveCount > 0 && now - this.windowFirstFailureAt <= DEGRADED_MODE_WINDOW_MS

    if (!sameClass || !withinWindow) {
      // Different class or window expired: start a fresh sequence.
      // Note: interleaved classes never trigger entry — known limitation per spec.
      this.currentErrorClass = errorClass
      this.windowFirstFailureAt = now
      this.consecutiveCount = 1

      return {
        enteredDegraded: false,
        inDegraded: false,
        anchorThreadId: null,
        windowFirstFailureAt: this.windowFirstFailureAt,
        suppressNotification: false,
      }
    }

    // Same class, still within window.
    this.consecutiveCount++

    if (this.consecutiveCount < DEGRADED_MODE_FAILURE_THRESHOLD) {
      return {
        enteredDegraded: false,
        inDegraded: false,
        anchorThreadId: null,
        windowFirstFailureAt: this.windowFirstFailureAt,
        suppressNotification: false,
      }
    }

    // Threshold reached on THIS failure (the Nth = threshold-tripping failure).
    // Anchor = this thread (the first thread whose individual notification is suppressed).
    this.inDegradedMode = true
    this.anchorThreadId = threadId
    this.aggregatedCount = DEGRADED_MODE_FAILURE_THRESHOLD
    this.entryAt = now

    return {
      enteredDegraded: true,
      inDegraded: true,
      anchorThreadId: this.anchorThreadId,
      windowFirstFailureAt: this.windowFirstFailureAt,
      suppressNotification: true,
    }
  }

  /**
   * Record a successful decision turn. Call synchronously in spawnTriggeredThread
   * immediately after runDecisionTurn succeeds.
   *
   * @param input.threadId - The thread that succeeded (unused in v1, kept for future multi-user).
   * @param input.now - Current timestamp (unused in v1, kept for symmetry).
   */
  recordSuccess(_input: { threadId: string; now: number }): RecordSuccessResult {
    if (!this.inDegradedMode) {
      // Not in degraded mode — reset consecutive counter and return no-exit.
      // Known v1 behaviour: a successful turn mid-window wipes any accumulated
      // pre-threshold count. So 4 fails → 1 success → 4 fails will not trigger
      // entry even within 60s. Treating success as a clean-state signal keeps
      // the state machine simple; a more sophisticated "did the underlying issue
      // recur?" tracker is a v2 concern.
      this.currentErrorClass = null
      this.windowFirstFailureAt = 0
      this.consecutiveCount = 0

      return {
        exitedDegraded: false,
        anchorThreadId: null,
        aggregatedCount: 0,
      }
    }

    // Exit degraded mode.
    const exitingAnchorThreadId = this.anchorThreadId
    const exitingAggregatedCount = this.aggregatedCount

    // Full reset.
    this.inDegradedMode = false
    this.anchorThreadId = null
    this.aggregatedCount = 0
    this.entryAt = null
    this.currentErrorClass = null
    this.windowFirstFailureAt = 0
    this.consecutiveCount = 0

    return {
      exitedDegraded: true,
      anchorThreadId: exitingAnchorThreadId,
      aggregatedCount: exitingAggregatedCount,
    }
  }

  /** Read-only accessor — useful for tests and a future "is degraded?" UI surface. */
  isInDegraded(): boolean {
    return this.inDegradedMode
  }
}
