import type { DecisionTurnOutput } from './producers/canned.js'

/**
 * String-literal union of known malformed-output reasons. Future cases (e.g.
 * `'contradiction_normal_and_silenced'`, `'multiple_normal_actions'`,
 * `'multiple_silent_actions'`) extend the union without a breaking change.
 */
export type ClosingActionMalformedReason = 'normal_message_empty_content'

/**
 * Thrown by `normalizeClosingAction` when the producer output fails the
 * closing-action contract (§04 lines 113–125).
 *
 * `error.name === 'ClosingActionMalformedError'` is the field that
 * `applyFailureFraming` reads to populate `error_class` in the activity-log
 * entry — so the class name MUST match `this.name`.
 *
 * Pattern mirrors `MigrationInterruptedError` in
 * `packages/migration/src/MigrationInterruptedError.ts`.
 */
export class ClosingActionMalformedError extends Error {
  readonly reason: ClosingActionMalformedReason

  constructor(reason: ClosingActionMalformedReason, detail: string) {
    super(`${reason}: ${detail}`)
    this.name = 'ClosingActionMalformedError'
    this.reason = reason
  }
}

/**
 * Validate and (in future versions) normalise the output of a decision-turn
 * producer against the closing-action contract (§04 lines 113–125).
 *
 * **v1 reachable cases** (the only two possible with the current single-output
 * producer interface):
 *
 * - `normal` visibility, no text (or whitespace-only text), and no tool_calls
 *   → throws `ClosingActionMalformedError('normal_message_empty_content', …)`.
 *   Covers both "zero closing actions" (§04 line 119) and "normal message with
 *   empty content" (§04 line 123) because in v1 a closing action's *value* is
 *   its message content.
 *
 * - `tool_calls: []` (empty array) is treated as "no tool calls" and IS
 *   flagged as malformed. Length 0 is semantically equivalent to absent.
 *
 * **Intentionally NOT flagged in v1:**
 *
 * - `silent` visibility with empty content. The spec table does not list it as
 *   a failure case. An empty silent note would still produce an `event_silenced`
 *   activity entry per §04 line 108 — but that entry is not yet wired in v1,
 *   so the silent path just persists with no log entry. Revisit this when
 *   `event_silenced` activity entries are wired.
 *
 * **TODO (v2):** The predicate may need a `tool_results?.length` clause when
 * result persistence lands. See `packages/core/src/messages/types.ts` line 79
 * (`/** v2 adds result persistence *\/`) for the field that will carry those
 * results. At that point a normal-visibility reply that has only `tool_results`
 * (and no text or tool_calls) should probably NOT be flagged.
 *
 * **Deferred normalization cases** (require a richer producer output type that
 * does not exist yet):
 * - Contradiction: one normal + one event_silenced in the same output.
 * - Multiple normal actions: retain all (§04 line 120).
 * - Multiple silent actions: retain all (§04 line 124).
 * These presuppose the producer can emit multiple actions per turn. Defer until
 * the `DecisionTurnOutput` shape widens.
 *
 * @returns The output unchanged when valid.
 * @throws {ClosingActionMalformedError} When the output violates the contract.
 */
export function normalizeClosingAction(output: DecisionTurnOutput): DecisionTurnOutput {
  const { visibility, content } = output

  if (
    visibility === 'normal' &&
    (!content.text || content.text.trim() === '') &&
    (!content.tool_calls || content.tool_calls.length === 0)
  ) {
    throw new ClosingActionMalformedError(
      'normal_message_empty_content',
      'closing reply has empty text and no tool calls'
    )
  }

  return output
}
