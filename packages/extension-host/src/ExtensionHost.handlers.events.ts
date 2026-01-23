/**
 * Events Request Handler
 *
 * Handles events.emit requests.
 */

import type { RequestMethod } from '@stina/extension-api'
import type { RequestHandler, HandlerContext } from './ExtensionHost.handlers.js'
import { getPayloadValue } from './ExtensionHost.handlers.js'

/**
 * Callback type for emitting extension events
 */
export type EmitEventCallback = (event: {
  extensionId: string
  name: string
  payload?: Record<string, unknown>
}) => void

/**
 * Handler for event emission requests
 */
export class EventsHandler implements RequestHandler {
  readonly methods = ['events.emit'] as const

  constructor(private readonly emitEvent: EmitEventCallback) {}

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

      default:
        throw new Error(`Unknown events method: ${method}`)
    }
  }
}
