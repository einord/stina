/**
 * New Storage Request Handler
 *
 * Handles storage.* requests for the new collection-based document storage.
 */

import type { RequestMethod, Query, QueryOptions } from '@stina/extension-api'
import type { RequestHandler, HandlerContext } from './ExtensionHost.handlers.js'
import { getPayloadValue, getRequiredString } from './ExtensionHost.handlers.js'

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
 * Callbacks for new storage operations.
 */
export interface NewStorageCallbacks {
  // Extension-scoped storage
  put(extensionId: string, collection: string, id: string, data: object): Promise<void>
  get(extensionId: string, collection: string, id: string): Promise<unknown>
  delete(extensionId: string, collection: string, id: string): Promise<boolean>
  find(extensionId: string, collection: string, query?: Query, options?: QueryOptions): Promise<unknown[]>
  findOne(extensionId: string, collection: string, query: Query): Promise<unknown>
  count(extensionId: string, collection: string, query?: Query): Promise<number>
  putMany(extensionId: string, collection: string, docs: Array<{ id: string; data: object }>): Promise<void>
  deleteMany(extensionId: string, collection: string, query: Query): Promise<number>
  dropCollection(extensionId: string, collection: string): Promise<void>
  listCollections(extensionId: string): Promise<string[]>

  // User-scoped storage (same operations but with userId)
  putForUser(extensionId: string, userId: string, collection: string, id: string, data: object): Promise<void>
  getForUser(extensionId: string, userId: string, collection: string, id: string): Promise<unknown>
  deleteForUser(extensionId: string, userId: string, collection: string, id: string): Promise<boolean>
  findForUser(
    extensionId: string,
    userId: string,
    collection: string,
    query?: Query,
    options?: QueryOptions
  ): Promise<unknown[]>
  findOneForUser(extensionId: string, userId: string, collection: string, query: Query): Promise<unknown>
  countForUser(extensionId: string, userId: string, collection: string, query?: Query): Promise<number>
  putManyForUser(
    extensionId: string,
    userId: string,
    collection: string,
    docs: Array<{ id: string; data: object }>
  ): Promise<void>
  deleteManyForUser(extensionId: string, userId: string, collection: string, query: Query): Promise<number>
  dropCollectionForUser(extensionId: string, userId: string, collection: string): Promise<void>
  listCollectionsForUser(extensionId: string, userId: string): Promise<string[]>
}

/**
 * Handler for new storage requests.
 */
export class NewStorageHandler implements RequestHandler {
  readonly methods = [
    // Extension-scoped
    'storage.put',
    'storage.get',
    'storage.delete',
    'storage.find',
    'storage.findOne',
    'storage.count',
    'storage.putMany',
    'storage.deleteMany',
    'storage.dropCollection',
    'storage.listCollections',
    // User-scoped
    'storage.putForUser',
    'storage.getForUser',
    'storage.deleteForUser',
    'storage.findForUser',
    'storage.findOneForUser',
    'storage.countForUser',
    'storage.putManyForUser',
    'storage.deleteManyForUser',
    'storage.dropCollectionForUser',
    'storage.listCollectionsForUser',
  ] as const

  constructor(private readonly callbacks: NewStorageCallbacks) {}

  async handle(ctx: HandlerContext, method: RequestMethod, payload: unknown): Promise<unknown> {
    // Check permission
    const check = ctx.extension.permissionChecker.checkStorageCollectionsAccess()
    if (!check.allowed) {
      throw new Error(check.reason)
    }

    switch (method) {
      // Extension-scoped operations
      case 'storage.put': {
        const collection = getRequiredString(payload, 'collection')
        const id = getRequiredString(payload, 'id')
        const data = getPayloadValue<object>(payload, 'data')
        if (!data || typeof data !== 'object') {
          throw new Error('data is required and must be an object')
        }
        // Validate collection access
        const collectionCheck = ctx.extension.permissionChecker.validateCollectionAccess(ctx.extensionId, collection)
        if (!collectionCheck.allowed) {
          throw new Error(collectionCheck.reason)
        }
        return this.callbacks.put(ctx.extensionId, collection, id, data)
      }

      case 'storage.get': {
        const collection = getRequiredString(payload, 'collection')
        const id = getRequiredString(payload, 'id')
        const collectionCheck = ctx.extension.permissionChecker.validateCollectionAccess(ctx.extensionId, collection)
        if (!collectionCheck.allowed) {
          throw new Error(collectionCheck.reason)
        }
        return this.callbacks.get(ctx.extensionId, collection, id)
      }

      case 'storage.delete': {
        const collection = getRequiredString(payload, 'collection')
        const id = getRequiredString(payload, 'id')
        const collectionCheck = ctx.extension.permissionChecker.validateCollectionAccess(ctx.extensionId, collection)
        if (!collectionCheck.allowed) {
          throw new Error(collectionCheck.reason)
        }
        return this.callbacks.delete(ctx.extensionId, collection, id)
      }

      case 'storage.find': {
        const collection = getRequiredString(payload, 'collection')
        const query = getPayloadValue<Query>(payload, 'query')
        const options = getPayloadValue<QueryOptions>(payload, 'options')
        const collectionCheck = ctx.extension.permissionChecker.validateCollectionAccess(ctx.extensionId, collection)
        if (!collectionCheck.allowed) {
          throw new Error(collectionCheck.reason)
        }
        return this.callbacks.find(ctx.extensionId, collection, query, options)
      }

      case 'storage.findOne': {
        const collection = getRequiredString(payload, 'collection')
        const query = getPayloadValue<Query>(payload, 'query')
        if (!query) {
          throw new Error('query is required')
        }
        const collectionCheck = ctx.extension.permissionChecker.validateCollectionAccess(ctx.extensionId, collection)
        if (!collectionCheck.allowed) {
          throw new Error(collectionCheck.reason)
        }
        return this.callbacks.findOne(ctx.extensionId, collection, query)
      }

      case 'storage.count': {
        const collection = getRequiredString(payload, 'collection')
        const query = getPayloadValue<Query>(payload, 'query')
        const collectionCheck = ctx.extension.permissionChecker.validateCollectionAccess(ctx.extensionId, collection)
        if (!collectionCheck.allowed) {
          throw new Error(collectionCheck.reason)
        }
        return this.callbacks.count(ctx.extensionId, collection, query)
      }

      case 'storage.putMany': {
        const collection = getRequiredString(payload, 'collection')
        const docs = getPayloadValue<Array<{ id: string; data: object }>>(payload, 'docs')
        if (!docs || !Array.isArray(docs)) {
          throw new Error('docs is required and must be an array')
        }
        const collectionCheck = ctx.extension.permissionChecker.validateCollectionAccess(ctx.extensionId, collection)
        if (!collectionCheck.allowed) {
          throw new Error(collectionCheck.reason)
        }
        return this.callbacks.putMany(ctx.extensionId, collection, docs)
      }

      case 'storage.deleteMany': {
        const collection = getRequiredString(payload, 'collection')
        const query = getPayloadValue<Query>(payload, 'query')
        if (!query) {
          throw new Error('query is required')
        }
        const collectionCheck = ctx.extension.permissionChecker.validateCollectionAccess(ctx.extensionId, collection)
        if (!collectionCheck.allowed) {
          throw new Error(collectionCheck.reason)
        }
        return this.callbacks.deleteMany(ctx.extensionId, collection, query)
      }

      case 'storage.dropCollection': {
        const collection = getRequiredString(payload, 'collection')
        const collectionCheck = ctx.extension.permissionChecker.validateCollectionAccess(ctx.extensionId, collection)
        if (!collectionCheck.allowed) {
          throw new Error(collectionCheck.reason)
        }
        return this.callbacks.dropCollection(ctx.extensionId, collection)
      }

      case 'storage.listCollections': {
        return this.callbacks.listCollections(ctx.extensionId)
      }

      // User-scoped operations
      case 'storage.putForUser':
      case 'storage.getForUser':
      case 'storage.deleteForUser':
      case 'storage.findForUser':
      case 'storage.findOneForUser':
      case 'storage.countForUser':
      case 'storage.putManyForUser':
      case 'storage.deleteManyForUser':
      case 'storage.dropCollectionForUser':
      case 'storage.listCollectionsForUser': {
        const userId = getRequiredString(payload, 'userId', 'userId is required for user-scoped storage')
        validateUserId(userId)

        // Delegate to appropriate user-scoped callback
        const baseMethod = method.replace('ForUser', '') as string
        switch (baseMethod) {
          case 'storage.put': {
            const collection = getRequiredString(payload, 'collection')
            const id = getRequiredString(payload, 'id')
            const data = getPayloadValue<object>(payload, 'data')
            if (!data) throw new Error('data is required')
            return this.callbacks.putForUser(ctx.extensionId, userId, collection, id, data)
          }
          case 'storage.get': {
            const collection = getRequiredString(payload, 'collection')
            const id = getRequiredString(payload, 'id')
            return this.callbacks.getForUser(ctx.extensionId, userId, collection, id)
          }
          case 'storage.delete': {
            const collection = getRequiredString(payload, 'collection')
            const id = getRequiredString(payload, 'id')
            return this.callbacks.deleteForUser(ctx.extensionId, userId, collection, id)
          }
          case 'storage.find': {
            const collection = getRequiredString(payload, 'collection')
            const query = getPayloadValue<Query>(payload, 'query')
            const options = getPayloadValue<QueryOptions>(payload, 'options')
            return this.callbacks.findForUser(ctx.extensionId, userId, collection, query, options)
          }
          case 'storage.findOne': {
            const collection = getRequiredString(payload, 'collection')
            const query = getPayloadValue<Query>(payload, 'query')
            if (!query) throw new Error('query is required')
            return this.callbacks.findOneForUser(ctx.extensionId, userId, collection, query)
          }
          case 'storage.count': {
            const collection = getRequiredString(payload, 'collection')
            const query = getPayloadValue<Query>(payload, 'query')
            return this.callbacks.countForUser(ctx.extensionId, userId, collection, query)
          }
          case 'storage.putMany': {
            const collection = getRequiredString(payload, 'collection')
            const docs = getPayloadValue<Array<{ id: string; data: object }>>(payload, 'docs')
            if (!docs) throw new Error('docs is required')
            return this.callbacks.putManyForUser(ctx.extensionId, userId, collection, docs)
          }
          case 'storage.deleteMany': {
            const collection = getRequiredString(payload, 'collection')
            const query = getPayloadValue<Query>(payload, 'query')
            if (!query) throw new Error('query is required')
            return this.callbacks.deleteManyForUser(ctx.extensionId, userId, collection, query)
          }
          case 'storage.dropCollection': {
            const collection = getRequiredString(payload, 'collection')
            return this.callbacks.dropCollectionForUser(ctx.extensionId, userId, collection)
          }
          case 'storage.listCollections': {
            return this.callbacks.listCollectionsForUser(ctx.extensionId, userId)
          }
        }
        break
      }

      default:
        throw new Error(`Unknown storage method: ${method}`)
    }
  }
}
