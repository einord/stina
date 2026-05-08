import type { ThreadTrigger } from '@stina/core'

/**
 * Extract the `extension_id` from a `ThreadTrigger` for use as a
 * forward-compat field on `NotificationEvent` (per-extension suppression
 * is a v2 concern; the field is plumbed through today so the SSE wire
 * format stays stable).
 *
 * Returns the extension_id for `mail` / `calendar` triggers; `undefined`
 * for `scheduled` (no extension_id field on the trigger by design — see
 * §04 / the event-source guide), `user`, and `stina` triggers.
 *
 * Shared between `runDecisionTurn` (success path) and `applyFailureFraming`
 * (failure path).
 */
export function extractExtensionId(trigger: ThreadTrigger): string | undefined {
  if (trigger.kind === 'mail' || trigger.kind === 'calendar') {
    return trigger.extension_id
  }
  return undefined
}

/**
 * Truncate notification preview text to ≤ 140 codepoints, appending `…`
 * on overflow. Strips leading/trailing whitespace first. Codepoint-aware
 * (matches the convention in `@stina/threads/triggerDerivation`).
 */
export function makePreview(text: string): string {
  const trimmed = text.trim()
  const codepoints = [...trimmed]
  if (codepoints.length <= 140) return trimmed
  return codepoints.slice(0, 139).join('') + '…'
}
