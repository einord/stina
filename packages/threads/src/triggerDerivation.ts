/**
 * Pure derivation helpers from a typed (trigger, content) pair to thread metadata.
 *
 * These helpers live in `@stina/threads` (not `@stina/extension-host`) so that
 * `@stina/orchestrator` can use them without inverting the package layer:
 *   extension-host → orchestrator → threads
 * extension-host re-exports them for back-compat with existing callers.
 *
 * Pure functions. No IO. No side effects.
 */

import type { ThreadTrigger, AppContent, EntityRef } from '@stina/core'

/**
 * Derive a thread title from a typed AppContent payload (§04 Phase 8a).
 *
 * Hard-capped at 200 codepoints; on overflow keeps the first 199 and appends
 * `…`. Swedish strings are intentional (no i18n surface in the runtime today).
 *
 * Covers all five `AppContent` kinds:
 *   - mail            → `Mail från ${from}: ${subject}`
 *   - calendar        → the calendar item title
 *   - scheduled       → `Schemalagt: ${description}`
 *   - system          → the message string (runtime-origin framing)
 *   - extension_status → `${extension_id}: ${status}`
 */
export function deriveTitleFromAppContent(content: AppContent): string {
  let text: string
  switch (content.kind) {
    case 'mail':
      text = `Mail från ${content.from}: ${content.subject}`
      break
    case 'calendar':
      text = content.title
      break
    case 'scheduled':
      text = `Schemalagt: ${content.description}`
      break
    case 'system':
      text = content.message
      break
    case 'extension_status':
      text = `${content.extension_id}: ${content.status}`
      break
  }
  return truncate200(text)
}

/**
 * Parse the `from` field of a mail AppContent into a canonical (email, display) pair.
 * Handles two formats:
 *   "Name <email>"  → { email: lowercased email, display: trimmed name }
 *   "bare@email"    → { email: lowercased email, display: lowercased email }
 * Malformed (no @) → { email: trimmed lowercased raw string, display: trimmed raw string }
 */
function parseMailFrom(from: string): { email: string; display: string } {
  const namedMatch = from.match(/^(.+?)\s*<([^>]+)>\s*$/)
  if (namedMatch) {
    const display = namedMatch[1]!.trim()
    const email = namedMatch[2]!.toLowerCase()
    return { email, display }
  }
  const trimmed = from.trim()
  if (trimmed.includes('@')) {
    const email = trimmed.toLowerCase()
    return { email, display: email }
  }
  const fallback = trimmed.toLowerCase()
  return { email: fallback, display: trimmed }
}

/** Truncate text to ≤ 200 codepoints. On overflow keeps the first 199 and appends `…`. */
function truncate200(text: string): string {
  const codepoints = [...text]
  if (codepoints.length > 200) {
    return codepoints.slice(0, 199).join('') + '…'
  }
  return text
}

/**
 * Input shape for `deriveLinkedEntities`. Intentionally a structural plain
 * object (not tied to any IPC handler's `EmitThreadEventInput`), so this
 * helper stays a pure trigger-derivation primitive.
 */
export interface DeriveLinkedEntitiesInput {
  trigger: ThreadTrigger
  content: AppContent
}

/**
 * Derive linked entity refs from a typed AppContent + trigger (§04 phase 8d).
 *
 * - mail             → one `person` EntityRef keyed by the sender's lowercased email address.
 *                      No separate `mail` ref: the trigger already carries mail_id; duplicating
 *                      it as an EntityRef has no consumer (no profile fact is keyed by an opaque
 *                      mail_id). YAGNI — add if a consumer appears.
 * - calendar         → one `calendar_event` EntityRef. Kept despite trigger redundancy because
 *                      §04 line 53 explicitly names event_id as a derivation example and v2 will
 *                      add attendee derivation that piggy-backs on this record.
 * - scheduled        → [] (job_id is a scheduler-internal handle, not a domain entity).
 * - system           → [] (runtime-origin framing has no domain entity).
 * - extension_status → [] (status notifications target an extension id, not a domain entity).
 *
 * Pure function. The `extension_id` on each produced ref equals
 * `trigger.extension_id` (the extension that owns the source data).
 */
export function deriveLinkedEntities(input: DeriveLinkedEntitiesInput): EntityRef[] {
  const { trigger, content } = input

  switch (content.kind) {
    case 'mail': {
      const { email, display } = parseMailFrom(content.from)
      const excerpt = truncate200(`${content.from}: ${content.subject}\n${content.snippet}`)
      const extensionId = (trigger as { kind: 'mail'; extension_id: string }).extension_id
      const ref: EntityRef = {
        kind: 'person',
        extension_id: extensionId,
        ref_id: email,
        snapshot: { display, excerpt },
      }
      return [ref]
    }

    case 'calendar': {
      const extensionId = (trigger as { kind: 'calendar'; extension_id: string }).extension_id
      const formattedTime = new Date(content.starts_at).toISOString()
      const excerptText = content.location
        ? `${content.title} · ${formattedTime} · ${content.location}`
        : `${content.title} · ${formattedTime}`
      const ref: EntityRef = {
        kind: 'calendar_event',
        extension_id: extensionId,
        ref_id: content.event_id,
        snapshot: {
          display: content.title,
          excerpt: truncate200(excerptText),
        },
      }
      return [ref]
    }

    case 'scheduled':
    case 'system':
    case 'extension_status':
      return []
  }
}
