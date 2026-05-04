import type {
  InstructionScope,
  InvalidationCondition,
  ProfileFact,
  StandingInstruction,
  ThreadSummary,
} from '@stina/core'
import { FIXTURE_NOW_MS, daysAgo, daysAhead, idGenerator, hoursAgo } from './deterministic.js'

const instructionId = idGenerator('tx-instr')
const factId = idGenerator('tx-fact')

/**
 * Build a StandingInstruction with sane defaults. Defaults to a user-set,
 * indefinitely-valid instruction created a day ago.
 */
export function makeStandingInstruction(
  overrides: Partial<StandingInstruction> = {}
): StandingInstruction {
  return {
    id: overrides.id ?? instructionId(),
    rule: overrides.rule ?? 'Notify me about mails from my manager.',
    scope: overrides.scope ?? ({ channels: ['mail'] } satisfies InstructionScope),
    valid_from: overrides.valid_from ?? daysAgo(1),
    valid_until: overrides.valid_until ?? null,
    invalidate_on: overrides.invalidate_on ?? ([] as InvalidationCondition[]),
    source_thread_id: overrides.source_thread_id ?? null,
    created_at: overrides.created_at ?? daysAgo(1),
    created_by: overrides.created_by ?? 'user',
  }
}

/**
 * Convenience: a vacation auto-reply instruction valid for the next week.
 */
export function makeVacationInstruction(
  overrides: Partial<StandingInstruction> = {}
): StandingInstruction {
  return makeStandingInstruction({
    rule: 'Reply to incoming work mail that I am on vacation until next Monday.',
    scope: { channels: ['mail'] },
    valid_from: hoursAgo(2),
    valid_until: daysAhead(7),
    invalidate_on: [
      { kind: 'date_passed', at: daysAhead(7) },
      { kind: 'user_says', pattern: "I'm back" },
    ],
    created_by: 'user',
    ...overrides,
  })
}

/**
 * Build a ProfileFact with sane defaults.
 */
export function makeProfileFact(overrides: Partial<ProfileFact> = {}): ProfileFact {
  const created = overrides.created_at ?? daysAgo(30)
  return {
    id: overrides.id ?? factId(),
    fact: overrides.fact ?? 'Peter Andersson is the user\'s manager.',
    subject: overrides.subject ?? 'user',
    predicate: overrides.predicate ?? 'manager_is',
    source_thread_id: overrides.source_thread_id ?? null,
    last_referenced_at: overrides.last_referenced_at ?? created,
    created_at: created,
    created_by: overrides.created_by ?? 'stina',
  }
}

/**
 * Build a ThreadSummary with sane defaults.
 */
export function makeThreadSummary(
  overrides: Partial<ThreadSummary> & { thread_id: string }
): ThreadSummary {
  return {
    thread_id: overrides.thread_id,
    summary:
      overrides.summary ?? 'Discussion about the Q2 plan; agreed Friday is the new deadline.',
    topics: overrides.topics ?? ['q2-plan', 'deadlines'],
    generated_at: overrides.generated_at ?? hoursAgo(6),
    message_count_at_generation: overrides.message_count_at_generation ?? 12,
  }
}

/**
 * Re-export FIXTURE_NOW_MS so consumers can construct relative timestamps
 * without importing two modules.
 */
export { FIXTURE_NOW_MS }
