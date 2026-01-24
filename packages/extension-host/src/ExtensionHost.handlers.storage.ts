/**
 * Storage Request Handler
 *
 * Handles storage.* requests for both global and user-scoped storage.
 * Note: This is an abstract handler - platform-specific implementations
 * must be provided by Web/NodeExtensionHost.
 */

import type { RequestMethod } from '@stina/extension-api'
import type { RequestHandler, HandlerContext } from './ExtensionHost.handlers.js'
import { getPayloadValue, getRequiredString } from './ExtensionHost.handlers.js'

/**
 * Validates that a userId has a valid format.
 * @param userId The userId to validate
 * @throws Error if userId is invalid
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
 * Callbacks for storage operations.
 * These are provided by the platform-specific extension host.
 */
export interface StorageCallbacks {
  // Global/extension-scoped storage
  get(extensionId: string, key: string): Promise<unknown>
  set(extensionId: string, key: string, value: unknown): Promise<void>
  delete(extensionId: string, key: string): Promise<void>
  keys(extensionId: string): Promise<string[]>

  // User-scoped storage
  getForUser(extensionId: string, userId: string, key: string): Promise<unknown>
  setForUser(extensionId: string, userId: string, key: string, value: unknown): Promise<void>
  deleteForUser(extensionId: string, userId: string, key: string): Promise<void>
  keysForUser(extensionId: string, userId: string): Promise<string[]>
}

/**
 * Handler for storage requests.
 * Requires platform-specific callbacks for actual storage operations.
 */
export class StorageHandler implements RequestHandler {
  readonly methods = [
    'storage.get',
    'storage.set',
    'storage.delete',
    'storage.keys',
    'storage.getForUser',
    'storage.setForUser',
    'storage.deleteForUser',
    'storage.keysForUser',
  ] as const

  constructor(private readonly callbacks: StorageCallbacks) {}

  /**
   * Handle a storage request
   * @param ctx Handler context
   * @param method The storage method
   * @param payload Request payload
   */
  async handle(ctx: HandlerContext, method: RequestMethod, payload: unknown): Promise<unknown> {
    // Check permission for all storage operations
    const check = ctx.extension.permissionChecker.checkStorageAccess()
    if (!check.allowed) {
      throw new Error(check.reason)
    }

    switch (method) {
      // Global/extension-scoped storage
      case 'storage.get': {
        const key = getRequiredString(payload, 'key')
        return this.callbacks.get(ctx.extensionId, key)
      }

      case 'storage.set': {
        const key = getRequiredString(payload, 'key')
        const value = getPayloadValue(payload, 'value')
        return this.callbacks.set(ctx.extensionId, key, value)
      }

      case 'storage.delete': {
        const key = getRequiredString(payload, 'key')
        return this.callbacks.delete(ctx.extensionId, key)
      }

      case 'storage.keys': {
        return this.callbacks.keys(ctx.extensionId)
      }

      // User-scoped storage
      case 'storage.getForUser': {
        const userId = getRequiredString(payload, 'userId', 'userId is required for user-scoped storage')
        validateUserId(userId)
        const key = getRequiredString(payload, 'key')
        return this.callbacks.getForUser(ctx.extensionId, userId, key)
      }

      case 'storage.setForUser': {
        const userId = getRequiredString(payload, 'userId', 'userId is required for user-scoped storage')
        validateUserId(userId)
        const key = getRequiredString(payload, 'key')
        const value = getPayloadValue(payload, 'value')
        return this.callbacks.setForUser(ctx.extensionId, userId, key, value)
      }

      case 'storage.deleteForUser': {
        const userId = getRequiredString(payload, 'userId', 'userId is required for user-scoped storage')
        validateUserId(userId)
        const key = getRequiredString(payload, 'key')
        return this.callbacks.deleteForUser(ctx.extensionId, userId, key)
      }

      case 'storage.keysForUser': {
        const userId = getRequiredString(payload, 'userId', 'userId is required for user-scoped storage')
        validateUserId(userId)
        return this.callbacks.keysForUser(ctx.extensionId, userId)
      }

      default:
        throw new Error(`Unknown storage method: ${method}`)
    }
  }
}
