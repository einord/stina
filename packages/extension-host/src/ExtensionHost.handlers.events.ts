/**
 * Events Request Handler
 *
 * Handles events.emit and events.emitEvent requests.
 */

import type { RequestMethod } from '@stina/extension-api'
import type { ThreadTrigger, AppContent } from '@stina/core'
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
 * Validated, host-stamped input for spawning a thread from an extension event
 * or from a runtime-internal call.
 *
 * For the public extension path, `source.extension_id` and
 * `trigger.extension_id` (for mail/calendar) are always set from the host's
 * authoritative extensionId — the worker-supplied values are overwritten
 * (§04 trust-boundary invariant).
 *
 * After Phase 8f this type accepts the full `ThreadTrigger` and `AppContent`
 * unions so the internal `spawnTriggeredThread` helper (which the public path
 * also uses) can carry runtime-origin `system` content and `stina` triggers.
 * The public `EventsHandler.handle('events.emitEvent')` still validates and
 * rejects those kinds before they reach this type.
 */
export interface EmitThreadEventInput {
  /** Full `ThreadTrigger` union from `@stina/core` — internal path accepts all kinds. */
  trigger: ThreadTrigger
  /** Full `AppContent` union from `@stina/core` — internal path accepts all kinds. */
  content: AppContent
  source: { extension_id: string; component?: string }
}

/**
 * Callback invoked by the EventsHandler when an extension calls emitEvent.
 * The host wires this to the thread-creation + decision-turn pipeline.
 */
export type EmitThreadEventCallback = (input: EmitThreadEventInput) => Promise<{ thread_id: string }>

/**
 * Re-exported from `@stina/threads` so existing extension-host consumers
 * don't have to update their imports. The actual implementations live in
 * `@stina/threads/triggerDerivation` to keep the package layer acyclic
 * (orchestrator depends on threads, not on extension-host).
 */
export { deriveTitleFromAppContent, deriveLinkedEntities } from '@stina/threads'

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
