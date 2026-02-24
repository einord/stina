/**
 * User Request Handler
 *
 * Handles user.getProfile requests.
 */

import type { RequestMethod } from '@stina/extension-api'
import type { RequestHandler, HandlerContext } from './ExtensionHost.handlers.js'

/**
 * Handler for user-related requests
 */
export class UserHandler implements RequestHandler {
  readonly methods = ['user.getProfile', 'user.listIds'] as const

  /**
   * Handle a user request
   * @param ctx Handler context
   * @param method The user method
   * @param _payload Request payload (unused for getProfile/listIds)
   */
  async handle(ctx: HandlerContext, method: RequestMethod, _payload: unknown): Promise<unknown> {
    switch (method) {
      case 'user.getProfile': {
        const check = ctx.extension.permissionChecker.checkUserProfileRead()
        if (!check.allowed) {
          throw new Error(check.reason)
        }
        if (!ctx.options.user) {
          throw new Error('User profile not available')
        }
        return ctx.options.user.getProfile(ctx.extensionId)
      }

      case 'user.listIds': {
        const check = ctx.extension.permissionChecker.checkUserProfileRead()
        if (!check.allowed) {
          throw new Error(check.reason)
        }
        if (!ctx.options.user) {
          throw new Error('User data not available')
        }
        return ctx.options.user.listIds()
      }

      default:
        throw new Error(`Unknown user method: ${method}`)
    }
  }
}
