import { and, eq } from 'drizzle-orm'
import { runtimeMarkers, type AutonomyDb } from '../schema.js'

/**
 * Repository for the `runtime_markers` table.
 *
 * A generic primitive for "did the runtime do this once?" markers, keyed by
 * (markerKey, userId). The first consumer is 'welcome_thread_v1', which tracks
 * whether the first-boot welcome thread has been spawned for a given user.
 *
 * Design: READ (`has`) and WRITE (`set`) are separate. Call `has` before the
 * action, and `set` after the action succeeds — not before. If the process
 * crashes between action and `set`, the next boot re-runs the action. That
 * at-least-once semantic is acceptable for welcome threads (a duplicate is
 * harmless) and cleaner than losing the action silently.
 */
export class RuntimeMarkersRepository {
  constructor(private db: AutonomyDb) {}

  /**
   * Returns true iff a row exists for (markerKey, userId).
   *
   * Does NOT write anything — use `set` after the action completes.
   */
  async has(markerKey: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ markerKey: runtimeMarkers.markerKey })
      .from(runtimeMarkers)
      .where(and(eq(runtimeMarkers.markerKey, markerKey), eq(runtimeMarkers.userId, userId)))
      .limit(1)

    return rows.length > 0
  }

  /**
   * Idempotent upsert — sets the marker for (markerKey, userId).
   *
   * Safe to call multiple times; subsequent calls are a no-op (the row already
   * exists and the upsert overwrites with the same values).
   *
   * @param value - Optional opaque metadata. NULL for boolean-only markers.
   * @param now   - Optional Unix ms timestamp; defaults to `Date.now()`.
   */
  async set(markerKey: string, userId: string, value?: string, now?: number): Promise<void> {
    const setAt = now ?? Date.now()
    await this.db
      .insert(runtimeMarkers)
      .values({ markerKey, userId, value: value ?? null, setAt })
      .onConflictDoUpdate({
        target: [runtimeMarkers.markerKey, runtimeMarkers.userId],
        set: { value: value ?? null, setAt },
      })
  }
}
