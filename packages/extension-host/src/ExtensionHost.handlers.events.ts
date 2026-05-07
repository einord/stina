/**
 * Events Request Handler
 *
 * Handles events.emit and events.emitEvent requests.
 */

import type { RequestMethod } from '@stina/extension-api'
import type { EntityRef } from '@stina/core'
import type { RequestHandler, HandlerContext } from './ExtensionHost.handlers.js'
import { getPayloadValue } from './ExtensionHost.handlers.js'

/**
 * Callback type for emitting extension events (legacy events.emit path)
 */
export type EmitEventCallback = (event: {
  extensionId: string
  name: string
  payload?: Record<string, unknown>
}) => void

/**
 * Validated, host-stamped input for spawning a thread from an extension event.
 *
 * The `source.extension_id` and `trigger.extension_id` (for mail/calendar)
 * are always set from the host's authoritative extensionId — the worker-
 * supplied values are overwritten (§04 trust-boundary invariant).
 */
export interface EmitThreadEventInput {
  trigger:
    | { kind: 'mail'; extension_id: string; mail_id: string }
    | { kind: 'calendar'; extension_id: string; event_id: string }
    | { kind: 'scheduled'; job_id: string }
  content:
    | { kind: 'mail'; from: string; subject: string; snippet: string; mail_id: string }
    | { kind: 'calendar'; title: string; starts_at: number; ends_at: number; location?: string; event_id: string }
    | { kind: 'scheduled'; job_id: string; description: string; payload?: Record<string, unknown> }
  source: { extension_id: string; component?: string }
}

/**
 * Callback invoked by the EventsHandler when an extension calls emitEvent.
 * The host wires this to the thread-creation + decision-turn pipeline.
 */
export type EmitThreadEventCallback = (input: EmitThreadEventInput) => Promise<{ thread_id: string }>

/**
 * Derive a thread title from a typed AppContent payload (§04 Phase 8a).
 * Hard-capped at 200 codepoints; on overflow keeps the first 199 and
 * appends `…`. Swedish strings are intentional (no i18n surface in the
 * runtime today). Shared between apps/api and apps/electron so the rule
 * is single-sourced.
 */
export function deriveTitleFromAppContent(content: EmitThreadEventInput['content']): string {
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
  }
  const codepoints = [...text]
  if (codepoints.length > 200) {
    return codepoints.slice(0, 199).join('') + '…'
  }
  return text
}

/**
 * Parse the `from` field of a mail AppContent into a canonical (email, display) pair.
 * Handles two formats:
 *   "Name <email>"  → { email: lowercased email, display: trimmed name }
 *   "bare@email"    → { email: lowercased email, display: lowercased email }
 * Malformed (no @) → { email: trimmed lowercased raw string, display: trimmed raw string }
 */
function parseMailFrom(from: string): { email: string; display: string } {
  // Named format: "Display Name <email@host>"
  const namedMatch = from.match(/^(.+?)\s*<([^>]+)>\s*$/)
  if (namedMatch) {
    const display = namedMatch[1]!.trim()
    const email = namedMatch[2]!.toLowerCase()
    return { email, display }
  }
  // Bare email or malformed
  const trimmed = from.trim()
  if (trimmed.includes('@')) {
    const email = trimmed.toLowerCase()
    return { email, display: email }
  }
  // Malformed — no @ present; use raw string as fallback
  const fallback = trimmed.toLowerCase()
  return { email: fallback, display: trimmed }
}

/**
 * Truncate text to ≤ 200 codepoints. On overflow keeps the first 199 and
 * appends `…`. Mirrors the convention used in deriveTitleFromAppContent.
 */
function truncate200(text: string): string {
  const codepoints = [...text]
  if (codepoints.length > 200) {
    return codepoints.slice(0, 199).join('') + '…'
  }
  return text
}

/**
 * Derive linked entity refs from a typed AppContent + trigger (§04 phase 8d).
 *
 * - mail    → one `person` EntityRef keyed by the sender's lowercased email address.
 *             No separate `mail` ref: the trigger already carries mail_id; duplicating
 *             it as an EntityRef has no consumer (no profile fact is keyed by an opaque
 *             mail_id). YAGNI — add if a consumer appears.
 * - calendar → one `calendar_event` EntityRef. Kept despite trigger redundancy because
 *              §04 line 53 explicitly names event_id as a derivation example and v2 will
 *              add attendee derivation that piggy-backs on this record.
 * - scheduled → [] (job_id is a scheduler-internal handle, not a domain entity).
 *
 * Pure function, no IO. The extension_id on each produced ref equals
 * input.trigger.extension_id (the extension that owns the source data).
 */
export function deriveLinkedEntities(input: EmitThreadEventInput): EntityRef[] {
  const { trigger, content } = input

  switch (content.kind) {
    case 'mail': {
      // ref_id is the lowercased email so two mails with different address casing
      // collapse to the same entity and match the same ProfileFact.subject.
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
      // job_id is a scheduler-internal handle — no domain entity to derive.
      return []
  }
}

/**
 * Handler for event emission requests
 */
export class EventsHandler implements RequestHandler {
  readonly methods = ['events.emit', 'events.emitEvent'] as const

  constructor(
    private readonly emitEvent: EmitEventCallback,
    private readonly emitThreadEvent?: EmitThreadEventCallback
  ) {}

  /**
   * Handle an events request
   * @param ctx Handler context
   * @param method The events method
   * @param payload Request payload
   */
  async handle(ctx: HandlerContext, method: RequestMethod, payload: unknown): Promise<unknown> {
    switch (method) {
      case 'events.emit': {
        const check = ctx.extension.permissionChecker.checkEventsEmit()
        if (!check.allowed) {
          throw new Error(check.reason)
        }

        const name = getPayloadValue<string>(payload, 'name')
        if (!name || typeof name !== 'string') {
          throw new Error('Event name is required')
        }

        const eventPayload = getPayloadValue<Record<string, unknown>>(payload, 'payload')
        if (eventPayload !== undefined && (typeof eventPayload !== 'object' || Array.isArray(eventPayload))) {
          throw new Error('Event payload must be an object')
        }

        this.emitEvent({
          extensionId: ctx.extensionId,
          name,
          payload: eventPayload,
        })

        return undefined
      }

      case 'events.emitEvent': {
        const check = ctx.extension.permissionChecker.checkEventsEmit()
        if (!check.allowed) {
          throw new Error(check.reason)
        }

        if (!this.emitThreadEvent) {
          throw new Error('emitEvent: no emitThreadEvent callback configured on this host')
        }

        // Extract and validate trigger
        const trigger = getPayloadValue<Record<string, unknown>>(payload, 'trigger')
        if (!trigger || typeof trigger !== 'object') {
          throw new Error('emitEvent: trigger is required and must be an object')
        }

        const triggerKind = trigger['kind']

        // Deny-list: extensions cannot impersonate user- or stina-origin events (§04).
        // Using an exhaustive switch so adding a new ThreadTrigger kind in @stina/core
        // becomes a TypeScript compile error here, forcing a deliberate accept/reject decision.
        switch (triggerKind) {
          case 'user':
          case 'stina':
            throw new Error(
              `emitEvent: trigger.kind '${triggerKind}' is not allowed from extensions — ` +
              'only mail, calendar, and scheduled triggers may be emitted via the extension API'
            )
          case 'mail':
          case 'calendar':
          case 'scheduled':
            // Accepted — continue below.
            break
          default:
            throw new Error(
              `emitEvent: unknown trigger.kind '${String(triggerKind)}' — ` +
              'accepted kinds are mail, calendar, scheduled'
            )
        }

        // Extract and validate content
        const content = getPayloadValue<Record<string, unknown>>(payload, 'content')
        if (!content || typeof content !== 'object') {
          throw new Error('emitEvent: content is required and must be an object')
        }

        const contentKind = content['kind']

        // Reject system content (host-only per §02 line 119)
        if (contentKind === 'system') {
          throw new Error('emitEvent: content.kind "system" is host-only and cannot be emitted by extensions')
        }

        // Reject extension_status on emitEvent for v1. This is a v1 simplification —
        // not a permanent restriction; the spec allows mid-thread mixed-kind app messages,
        // just not via emitEvent's first message until self-status reporting is a real flow.
        if (contentKind === 'extension_status') {
          throw new Error(
            'emitEvent: content.kind "extension_status" is not supported on emitEvent in v1 — ' +
            'extension self-status reporting is deferred to a future step'
          )
        }

        // Enforce trigger ↔ content kind pairing
        if (triggerKind !== contentKind) {
          throw new Error(
            `emitEvent: trigger.kind '${String(triggerKind)}' and content.kind '${String(contentKind)}' must match`
          )
        }

        // Extract source (optional component field)
        const rawSource = getPayloadValue<Record<string, unknown>>(payload, 'source')
        const component =
          rawSource && typeof rawSource['component'] === 'string' ? rawSource['component'] : undefined

        // Build the validated, host-stamped input.
        // §04 trust invariant: extension_id is always stamped from ctx.extensionId;
        // whatever the worker sent is discarded.
        let validatedTrigger: EmitThreadEventInput['trigger']
        if (triggerKind === 'mail') {
          const mail_id = trigger['mail_id']
          if (!mail_id || typeof mail_id !== 'string') {
            throw new Error('emitEvent: trigger.mail_id is required for kind "mail"')
          }
          validatedTrigger = { kind: 'mail', extension_id: ctx.extensionId, mail_id }
        } else if (triggerKind === 'calendar') {
          const event_id = trigger['event_id']
          if (!event_id || typeof event_id !== 'string') {
            throw new Error('emitEvent: trigger.event_id is required for kind "calendar"')
          }
          validatedTrigger = { kind: 'calendar', extension_id: ctx.extensionId, event_id }
        } else {
          // scheduled
          const job_id = trigger['job_id']
          if (!job_id || typeof job_id !== 'string') {
            throw new Error('emitEvent: trigger.job_id is required for kind "scheduled"')
          }
          validatedTrigger = { kind: 'scheduled', job_id }
        }

        let validatedContent: EmitThreadEventInput['content']
        if (contentKind === 'mail') {
          const from = content['from']
          const subject = content['subject']
          const snippet = content['snippet']
          const mail_id = content['mail_id']
          if (typeof from !== 'string' || typeof subject !== 'string' || typeof snippet !== 'string' || typeof mail_id !== 'string') {
            throw new Error('emitEvent: mail content requires from, subject, snippet, mail_id (all strings)')
          }
          validatedContent = { kind: 'mail', from, subject, snippet, mail_id }
        } else if (contentKind === 'calendar') {
          const title = content['title']
          const starts_at = content['starts_at']
          const ends_at = content['ends_at']
          const event_id = content['event_id']
          if (typeof title !== 'string' || typeof starts_at !== 'number' || typeof ends_at !== 'number' || typeof event_id !== 'string') {
            throw new Error('emitEvent: calendar content requires title (string), starts_at/ends_at (number), event_id (string)')
          }
          const location = typeof content['location'] === 'string' ? content['location'] : undefined
          validatedContent = { kind: 'calendar', title, starts_at, ends_at, event_id, ...(location ? { location } : {}) }
        } else {
          // scheduled
          const job_id = content['job_id']
          const description = content['description']
          if (typeof job_id !== 'string' || typeof description !== 'string') {
            throw new Error('emitEvent: scheduled content requires job_id and description (both strings)')
          }
          const contentPayload = content['payload'] !== undefined && typeof content['payload'] === 'object' && !Array.isArray(content['payload'])
            ? (content['payload'] as Record<string, unknown>)
            : undefined
          validatedContent = { kind: 'scheduled', job_id, description, ...(contentPayload ? { payload: contentPayload } : {}) }
        }

        const validatedInput: EmitThreadEventInput = {
          trigger: validatedTrigger,
          content: validatedContent,
          source: {
            extension_id: ctx.extensionId, // host stamps, ignores worker claim
            ...(component ? { component } : {}),
          },
        }

        const result = await this.emitThreadEvent(validatedInput)
        return result
      }

      default:
        throw new Error(`Unknown events method: ${method}`)
    }
  }
}
