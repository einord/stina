import type {
  ActivityLogEntry,
  AutoPolicy,
  Message,
  ProfileFact,
  StandingInstruction,
  Thread,
  ThreadSummary,
} from '@stina/core'

/**
 * A Scenario is a complete bundle of fixtures: every record needed to render
 * a particular UI state. Scenarios compose the `make*` factories and are
 * shared across the dev seed CLI, the v1 Playwright suite, and (later) §08's
 * synthetic v0.x snapshot tests.
 *
 * Records are *intentionally* plain data — no DB access, no side effects.
 * The `seed()` helper is the bridge that writes a Scenario to a database.
 */
export interface Scenario {
  /** Slug used by the CLI: `pnpm seed-dev-db <slug>`. */
  id: string
  /** Short human-readable description. */
  description: string
  threads: Thread[]
  messages: Message[]
  standing_instructions: StandingInstruction[]
  profile_facts: ProfileFact[]
  thread_summaries: ThreadSummary[]
  auto_policies: AutoPolicy[]
  activity_log_entries: ActivityLogEntry[]
}
