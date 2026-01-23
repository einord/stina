/**
 * Settings Request Handler
 *
 * Handles settings.getAll, settings.get, and settings.set requests.
 */

import type { RequestMethod } from '@stina/extension-api'
import type { RequestHandler, HandlerContext } from './ExtensionHost.handlers.js'
import { getPayloadValue, getRequiredString } from './ExtensionHost.handlers.js'

/**
 * Handler for extension settings requests
 */
export class SettingsHandler implements RequestHandler {
  readonly methods = ['settings.getAll', 'settings.get', 'settings.set'] as const

  /**
   * Handle a settings request
   * @param ctx Handler context
   * @param method The settings method
   * @param payload Request payload
   */
  async handle(ctx: HandlerContext, method: RequestMethod, payload: unknown): Promise<unknown> {
    switch (method) {
      case 'settings.getAll':
        return ctx.extension.settings

      case 'settings.get': {
        const key = getRequiredString(payload, 'key')
        return ctx.extension.settings[key]
      }

      case 'settings.set': {
        const check = ctx.extension.permissionChecker.checkSettingsAccess()
        if (!check.allowed) {
          throw new Error(check.reason)
        }
        const key = getRequiredString(payload, 'key')
        const value = getPayloadValue(payload, 'value')
        ctx.extension.settings[key] = value
        return undefined
      }

      default:
        throw new Error(`Unknown settings method: ${method}`)
    }
  }
}
