/**
 * Deterministic helpers for test fixtures.
 *
 * Real production code uses nanoid + Date.now(); fixtures need IDs and
 * timestamps that are stable across test runs so screenshots and equality
 * assertions stay reproducible.
 */

/**
 * Builds a counter-based ID generator. Each call returns a deterministic
 * id like `tx-thread-001`. Reset state by creating a new generator.
 */
export function idGenerator(prefix: string): () => string {
  let counter = 0
  return () => {
    counter += 1
    return `${prefix}-${String(counter).padStart(3, '0')}`
  }
}

/**
 * Fixed reference date for fixtures: 2026-05-04 08:00:00 UTC.
 * All other fixture timestamps are expressed as offsets from this anchor
 * unless explicitly overridden, so a snapshot taken now and one taken in
 * a year produce identical fixture data.
 */
export const FIXTURE_NOW_MS = Date.UTC(2026, 4, 4, 8, 0, 0)

/** Helpers to express timestamps relative to FIXTURE_NOW_MS. */
export const minutesAgo = (n: number, anchor = FIXTURE_NOW_MS): number =>
  anchor - n * 60 * 1000
export const hoursAgo = (n: number, anchor = FIXTURE_NOW_MS): number =>
  anchor - n * 60 * 60 * 1000
export const daysAgo = (n: number, anchor = FIXTURE_NOW_MS): number =>
  anchor - n * 24 * 60 * 60 * 1000

/** Inverse of daysAgo for forward-looking validity (e.g. valid_until). */
export const daysAhead = (n: number, anchor = FIXTURE_NOW_MS): number =>
  anchor + n * 24 * 60 * 60 * 1000
