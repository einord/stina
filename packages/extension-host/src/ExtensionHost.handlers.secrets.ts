/**
 * Secrets Request Handler
 *
 * Handles secrets.* requests for secure credential storage.
 */

import type { RequestMethod } from '@stina/extension-api'
import type { RequestHandler, HandlerContext } from './ExtensionHost.handlers.js'
import { getRequiredString } from './ExtensionHost.handlers.js'

/**
 * Validates that a userId has a valid format.
 */
function validateUserId(userId: string): void {
  if (!userId || userId.length === 0) {
    throw new Error('userId cannot be empty')
  }
  if (userId.includes(':') || userId.includes('/') || userId.includes('\\')) {
    throw new Error('userId contains invalid characters')
  }
}

/**
 * Callbacks for secrets operations.
 */
export interface SecretsCallbacks {
  // Extension-scoped secrets
  set(extensionId: string, key: string, value: string): Promise<void>
  get(extensionId: string, key: string): Promise<string | undefined>
  delete(extensionId: string, key: string): Promise<boolean>
  list(extensionId: string): Promise<string[]>

  // User-scoped secrets
  setForUser(extensionId: string, userId: string, key: string, value: string): Promise<void>
  getForUser(extensionId: string, userId: string, key: string): Promise<string | undefined>
  deleteForUser(extensionId: string, userId: string, key: string): Promise<boolean>
  listForUser(extensionId: string, userId: string): Promise<string[]>
}

/**
 * Handler for secrets requests.
 */
export class SecretsHandler implements RequestHandler {
  readonly methods = [
    'secrets.set',
    'secrets.get',
    'secrets.delete',
    'secrets.list',
    'secrets.setForUser',
    'secrets.getForUser',
    'secrets.deleteForUser',
    'secrets.listForUser',
  ] as const

  constructor(private readonly callbacks: SecretsCallbacks) {}

  async handle(ctx: HandlerContext, method: RequestMethod, payload: unknown): Promise<unknown> {
    // Check permission
    const check = ctx.extension.permissionChecker.checkSecretsAccess()
    if (!check.allowed) {
      throw new Error(check.reason)
    }

    switch (method) {
      // Extension-scoped secrets
      case 'secrets.set': {
        const key = getRequiredString(payload, 'key')
        const value = getRequiredString(payload, 'value')
        return this.callbacks.set(ctx.extensionId, key, value)
      }

      case 'secrets.get': {
        const key = getRequiredString(payload, 'key')
        return this.callbacks.get(ctx.extensionId, key)
      }

      case 'secrets.delete': {
        const key = getRequiredString(payload, 'key')
        return this.callbacks.delete(ctx.extensionId, key)
      }

      case 'secrets.list': {
        return this.callbacks.list(ctx.extensionId)
      }

      // User-scoped secrets
      case 'secrets.setForUser': {
        const userId = getRequiredString(payload, 'userId', 'userId is required')
        validateUserId(userId)
        const key = getRequiredString(payload, 'key')
        const value = getRequiredString(payload, 'value')
        return this.callbacks.setForUser(ctx.extensionId, userId, key, value)
      }

      case 'secrets.getForUser': {
        const userId = getRequiredString(payload, 'userId', 'userId is required')
        validateUserId(userId)
        const key = getRequiredString(payload, 'key')
        return this.callbacks.getForUser(ctx.extensionId, userId, key)
      }

      case 'secrets.deleteForUser': {
        const userId = getRequiredString(payload, 'userId', 'userId is required')
        validateUserId(userId)
        const key = getRequiredString(payload, 'key')
        return this.callbacks.deleteForUser(ctx.extensionId, userId, key)
      }

      case 'secrets.listForUser': {
        const userId = getRequiredString(payload, 'userId', 'userId is required')
        validateUserId(userId)
        return this.callbacks.listForUser(ctx.extensionId, userId)
      }

      default:
        throw new Error(`Unknown secrets method: ${method}`)
    }
  }
}
