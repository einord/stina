/**
 * Thread types — see docs/redesign-2026/02-data-model.md §Thread.
 *
 * A Thread is a self-contained conversation. Every Message belongs to exactly
 * one Thread. Threads are first-class objects in the inbox model.
 */

export type ThreadStatus = 'active' | 'quiet' | 'archived'

/**
 * Reason a Stina-triggered Thread was opened.
 *
 * - dream_pass_insight: spawned by a dream-pass task; dream_pass_run_id is set
 * - recap: the daily recap thread spawned by the runtime at recap-time
 * - manual: catch-all for runtime-internal opens (first-launch welcome,
 *   post-upgrade welcome, etc.)
 */
export type StinaTriggerReason = 'dream_pass_insight' | 'recap' | 'manual'

/**
 * Discriminated union describing why a Thread exists. The runtime treats each
 * kind differently in the decision-turn input loader and in the UI's
 * filter/segment behavior.
 */
export type ThreadTrigger =
  | { kind: 'user' }
  | { kind: 'mail'; extension_id: string; mail_id: string }
  | { kind: 'calendar'; extension_id: string; event_id: string }
  | { kind: 'scheduled'; job_id: string }
  | {
      kind: 'stina'
      reason: StinaTriggerReason
      dream_pass_run_id?: string
      insight?: string
    }

/**
 * A small, durable record of what an EntityRef pointed to at creation time.
 * Snapshots survive extension uninstall and source-record deletion; they are
 * the audit-bearing fallback when live data is no longer available.
 *
 * Snapshots are written by the runtime during entity-derivation from
 * AppContent. Extensions cannot supply the snapshot directly.
 */
export interface EntityRefSnapshot {
  /** Human-readable label, e.g. "Peter Andersson <peter@…>" for a person. */
  display: string
  /**
   * Optional ≤ 200-char excerpt of the source content. For mail this is
   * sender + subject + snippet; for calendar this is title + time + location.
   */
  excerpt?: string
}

/**
 * Reference into an extension's domain data, with a durable snapshot.
 * The kind enum is open-ended (string fallback) so extensions can introduce
 * new entity kinds without core changes.
 */
export interface EntityRef {
  kind: 'person' | 'mail' | 'calendar_event' | 'todo' | (string & {})
  extension_id: string
  ref_id: string
  snapshot: EntityRefSnapshot
}

/**
 * The persistent shape of a Thread.
 *
 * Status transitions:
 * - active → quiet: automatic after idle timeout (default 48h; recap thread
 *   has a fixed 12h timeout per §05)
 * - quiet → active: automatic on any new activity (app message, user reply,
 *   Stina turn — including synthetic dream-pass insight)
 * - quiet → archived: user-driven only
 *
 * Visibility lifecycle (spec §04):
 * - first_turn_completed_at is the structural invisibility gate. A thread is
 *   not visible in GET /threads (default list) until this is set. Both
 *   runDecisionTurn (success path) and applyFailureFraming (after framing
 *   append succeeds) set this. Monotonic.
 * - surfaced_at is set the moment Stina produces a normal-visibility message
 *   addressed to the user. Monotonic.
 * - notified_at is set the moment a user-facing notification fires. Usually
 *   equal to surfaced_at but may differ (manual open, suppression by user
 *   settings, degraded-mode aggregation).
 */
export interface Thread {
  id: string
  trigger: ThreadTrigger
  status: ThreadStatus
  /** unix ms when the first decision turn completed (success or failure framing). NULL = pending, invisible in GET /threads. */
  first_turn_completed_at: number | null
  surfaced_at: number | null
  notified_at: number | null
  title: string
  summary: string | null
  linked_entities: EntityRef[]
  created_at: number
  last_activity_at: number
}
