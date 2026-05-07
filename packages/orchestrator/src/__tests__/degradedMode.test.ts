/**
 * Unit tests for DegradedModeTracker (§04 lines 147–157).
 *
 * Each test instantiates a fresh tracker — no shared state across tests.
 */

import { describe, it, expect } from 'vitest'
import {
  DegradedModeTracker,
  DEGRADED_MODE_FAILURE_THRESHOLD,
  DEGRADED_MODE_WINDOW_MS,
} from '../degradedMode.js'

const T = 1_700_000_000_000 // Arbitrary base timestamp

// ─── Threshold not reached ────────────────────────────────────────────────────

describe('DegradedModeTracker — threshold not reached', () => {
  it('4 same-class failures within window → inDegraded: false throughout', () => {
    const tracker = new DegradedModeTracker()
    for (let i = 0; i < 4; i++) {
      const result = tracker.recordFailure({
        threadId: `thread-${i}`,
        errorClass: 'TypeError',
        now: T + i * 1000,
      })
      expect(result.inDegraded).toBe(false)
      expect(result.enteredDegraded).toBe(false)
      expect(result.suppressNotification).toBe(false)
      expect(result.anchorThreadId).toBeNull()
    }
    expect(tracker.isInDegraded()).toBe(false)
  })
})

// ─── Threshold reached ────────────────────────────────────────────────────────

describe('DegradedModeTracker — threshold reached at 5th failure', () => {
  it('5th failure: enteredDegraded=true, anchor=5th thread (NOT 1st)', () => {
    const tracker = new DegradedModeTracker()
    let result

    for (let i = 0; i < 4; i++) {
      tracker.recordFailure({ threadId: `thread-${i}`, errorClass: 'TypeError', now: T + i * 1000 })
    }

    result = tracker.recordFailure({
      threadId: 'thread-5th',
      errorClass: 'TypeError',
      now: T + 4 * 1000,
    })

    expect(result.enteredDegraded).toBe(true)
    expect(result.inDegraded).toBe(true)
    expect(result.suppressNotification).toBe(true)
    // Anchor MUST be the 5th thread, not thread-0.
    expect(result.anchorThreadId).toBe('thread-5th')
    expect(tracker.isInDegraded()).toBe(true)
  })
})

// ─── Window inclusivity ───────────────────────────────────────────────────────

describe('DegradedModeTracker — window inclusivity', () => {
  it('5th failure exactly at windowFirstFailureAt + 60_000 → still in window → enteredDegraded: true', () => {
    const tracker = new DegradedModeTracker()
    const base = T

    for (let i = 0; i < 4; i++) {
      tracker.recordFailure({ threadId: `t${i}`, errorClass: 'TypeError', now: base + i })
    }

    // Exactly at boundary (inclusive)
    const result = tracker.recordFailure({
      threadId: 'boundary',
      errorClass: 'TypeError',
      now: base + DEGRADED_MODE_WINDOW_MS,
    })

    expect(result.enteredDegraded).toBe(true)
    expect(result.anchorThreadId).toBe('boundary')
  })

  it('5th failure at windowFirstFailureAt + 60_001 → window expired → counter resets → enteredDegraded: false', () => {
    const tracker = new DegradedModeTracker()
    const base = T

    for (let i = 0; i < 4; i++) {
      tracker.recordFailure({ threadId: `t${i}`, errorClass: 'TypeError', now: base + i })
    }

    // One ms past the boundary — window expired
    const result = tracker.recordFailure({
      threadId: 'expired',
      errorClass: 'TypeError',
      now: base + DEGRADED_MODE_WINDOW_MS + 1,
    })

    expect(result.enteredDegraded).toBe(false)
    expect(result.inDegraded).toBe(false)
    expect(result.anchorThreadId).toBeNull()
    // The expired call resets to consecutiveCount=1 (new window starting now).
    expect(tracker.isInDegraded()).toBe(false)
  })
})

// ─── Window expiration ────────────────────────────────────────────────────────

describe('DegradedModeTracker — window expiration', () => {
  it('4 failures in window, 5th failure after 61s → counter resets (counts as new sequence #1)', () => {
    const tracker = new DegradedModeTracker()
    const base = T

    for (let i = 0; i < 4; i++) {
      tracker.recordFailure({ threadId: `t${i}`, errorClass: 'TypeError', now: base + i * 1000 })
    }

    const result = tracker.recordFailure({
      threadId: 'after-gap',
      errorClass: 'TypeError',
      now: base + 61_000,
    })

    expect(result.inDegraded).toBe(false)
    expect(result.enteredDegraded).toBe(false)
    // This call starts a fresh window — consecutiveCount=1
    expect(result.suppressNotification).toBe(false)
  })
})

// ─── Different class breaks consecutive ──────────────────────────────────────

describe('DegradedModeTracker — different class breaks consecutive', () => {
  it('3 TypeError + 1 ClosingActionMalformedError + 5 TypeError → entry on 9th (5th of second TypeError run)', () => {
    const tracker = new DegradedModeTracker()
    const base = T

    // 3 TypeErrors
    for (let i = 0; i < 3; i++) {
      const r = tracker.recordFailure({ threadId: `t${i}`, errorClass: 'TypeError', now: base + i * 100 })
      expect(r.enteredDegraded).toBe(false)
    }

    // 1 different class
    const breakResult = tracker.recordFailure({
      threadId: 'break',
      errorClass: 'ClosingActionMalformedError',
      now: base + 300,
    })
    expect(breakResult.enteredDegraded).toBe(false)

    // 4 more TypeErrors (counter now at 1,2,3,4 — no trigger yet)
    for (let i = 0; i < 4; i++) {
      const r = tracker.recordFailure({ threadId: `t2-${i}`, errorClass: 'TypeError', now: base + 400 + i * 100 })
      expect(r.enteredDegraded).toBe(false)
    }

    // 5th of the new TypeError run — failure #9 overall → entry; anchor = this thread
    const entryResult = tracker.recordFailure({
      threadId: 'thread-9',
      errorClass: 'TypeError',
      now: base + 800,
    })
    expect(entryResult.enteredDegraded).toBe(true)
    expect(entryResult.anchorThreadId).toBe('thread-9')
  })
})

// ─── Already in degraded mode ─────────────────────────────────────────────────

describe('DegradedModeTracker — already in degraded mode', () => {
  function enterDegraded(): DegradedModeTracker {
    const tracker = new DegradedModeTracker()
    for (let i = 0; i < DEGRADED_MODE_FAILURE_THRESHOLD; i++) {
      tracker.recordFailure({ threadId: `t${i}`, errorClass: 'TypeError', now: T + i * 100 })
    }
    return tracker
  }

  it('failures 6,7,8 of any class → inDegraded:true, enteredDegraded:false, suppressed, anchor unchanged', () => {
    const tracker = enterDegraded()
    const anchorBefore = tracker.recordFailure({ threadId: 'dummy', errorClass: 'TypeError', now: T + 10_000 }).anchorThreadId

    for (const cls of ['TypeError', 'RangeError', 'TypeError']) {
      const r = tracker.recordFailure({ threadId: 'extra', errorClass: cls, now: T + 20_000 })
      expect(r.inDegraded).toBe(true)
      expect(r.enteredDegraded).toBe(false)
      expect(r.suppressNotification).toBe(true)
      expect(r.anchorThreadId).toBe(anchorBefore)
    }
  })
})

// ─── Cross-class aggregation while degraded ──────────────────────────────────

describe('DegradedModeTracker — cross-class aggregation while degraded', () => {
  it('5 TypeErrors enter degraded, then ClosingActionMalformedError → still aggregated, anchor unchanged', () => {
    const tracker = new DegradedModeTracker()
    const base = T

    for (let i = 0; i < DEGRADED_MODE_FAILURE_THRESHOLD; i++) {
      tracker.recordFailure({ threadId: `t${i}`, errorClass: 'TypeError', now: base + i * 100 })
    }

    expect(tracker.isInDegraded()).toBe(true)

    const crossClassResult = tracker.recordFailure({
      threadId: 'different-class',
      errorClass: 'ClosingActionMalformedError',
      now: base + 1000,
    })

    expect(crossClassResult.inDegraded).toBe(true)
    expect(crossClassResult.enteredDegraded).toBe(false)
    expect(crossClassResult.suppressNotification).toBe(true)
    // Anchor is still the 5th TypeError thread
    expect(crossClassResult.anchorThreadId).toBe(`t${DEGRADED_MODE_FAILURE_THRESHOLD - 1}`)
  })
})

// ─── Exit on success ──────────────────────────────────────────────────────────

describe('DegradedModeTracker — exit on success', () => {
  it('enter at 5 then success → exitedDegraded:true, anchorThreadId returned, aggregatedCount===5', () => {
    const tracker = new DegradedModeTracker()
    for (let i = 0; i < DEGRADED_MODE_FAILURE_THRESHOLD; i++) {
      tracker.recordFailure({ threadId: `t${i}`, errorClass: 'TypeError', now: T + i * 100 })
    }
    const anchorId = `t${DEGRADED_MODE_FAILURE_THRESHOLD - 1}`

    const successResult = tracker.recordSuccess({ threadId: 'success-thread', now: T + 5000 })

    expect(successResult.exitedDegraded).toBe(true)
    expect(successResult.anchorThreadId).toBe(anchorId)
    expect(successResult.aggregatedCount).toBe(DEGRADED_MODE_FAILURE_THRESHOLD)
    expect(tracker.isInDegraded()).toBe(false)
  })
})

// ─── Exit resets tracker ──────────────────────────────────────────────────────

describe('DegradedModeTracker — exit resets tracker', () => {
  it('after exit, a subsequent failure starts a fresh window with consecutiveCount=1', () => {
    const tracker = new DegradedModeTracker()

    // Enter
    for (let i = 0; i < DEGRADED_MODE_FAILURE_THRESHOLD; i++) {
      tracker.recordFailure({ threadId: `t${i}`, errorClass: 'TypeError', now: T + i * 100 })
    }
    // Exit
    tracker.recordSuccess({ threadId: 'ok', now: T + 5000 })

    expect(tracker.isInDegraded()).toBe(false)

    // New failure — should start fresh (1 out of 5)
    const fresh = tracker.recordFailure({
      threadId: 'post-exit',
      errorClass: 'TypeError',
      now: T + 10_000,
    })
    expect(fresh.inDegraded).toBe(false)
    expect(fresh.enteredDegraded).toBe(false)
    expect(fresh.suppressNotification).toBe(false)
  })
})

// ─── Test isolation ───────────────────────────────────────────────────────────

describe('DegradedModeTracker — test isolation', () => {
  it('each test creates a fresh tracker — no shared state between test instances', () => {
    const t1 = new DegradedModeTracker()
    const t2 = new DegradedModeTracker()

    // Drive t1 into degraded mode
    for (let i = 0; i < DEGRADED_MODE_FAILURE_THRESHOLD; i++) {
      t1.recordFailure({ threadId: `x${i}`, errorClass: 'TypeError', now: T + i })
    }

    // t2 should be completely unaffected
    expect(t1.isInDegraded()).toBe(true)
    expect(t2.isInDegraded()).toBe(false)
  })
})

// ─── Aggregated count increments while degraded ───────────────────────────────

describe('DegradedModeTracker — aggregatedCount increments while degraded', () => {
  it('after entry, each additional failure increments aggregatedCount; exit returns total', () => {
    const tracker = new DegradedModeTracker()

    // Enter at 5
    for (let i = 0; i < DEGRADED_MODE_FAILURE_THRESHOLD; i++) {
      tracker.recordFailure({ threadId: `t${i}`, errorClass: 'TypeError', now: T + i * 100 })
    }

    // 3 more failures while degraded
    for (let i = 0; i < 3; i++) {
      tracker.recordFailure({ threadId: `extra-${i}`, errorClass: 'TypeError', now: T + 5000 + i * 100 })
    }

    // Exit
    const exitResult = tracker.recordSuccess({ threadId: 'recovery', now: T + 10_000 })
    expect(exitResult.exitedDegraded).toBe(true)
    expect(exitResult.aggregatedCount).toBe(DEGRADED_MODE_FAILURE_THRESHOLD + 3) // 5 + 3 = 8
  })
})

// ─── recordSuccess outside degraded mode ─────────────────────────────────────

describe('DegradedModeTracker — recordSuccess outside degraded mode', () => {
  it('success when not degraded → exitedDegraded:false', () => {
    const tracker = new DegradedModeTracker()
    const result = tracker.recordSuccess({ threadId: 'ok', now: T })
    expect(result.exitedDegraded).toBe(false)
    expect(result.anchorThreadId).toBeNull()
    expect(result.aggregatedCount).toBe(0)
  })
})
