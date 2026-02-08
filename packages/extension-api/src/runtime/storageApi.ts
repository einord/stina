/**
 * Storage API builders for extension and user-scoped storage.
 */

import type { StorageAPI, Query, QueryOptions } from '../types.js'
import type { RequestMessage } from '../messages.js'

type SendRequest = <T>(method: RequestMessage['method'], payload: unknown) => Promise<T>

/**
 * Create a storage API that delegates to the host via request messages.
 * Used for both extension-scoped and user-scoped storage by varying the method prefix.
 */
function buildStorageAPI(
  sendRequest: SendRequest,
  methodSuffix: '' | 'ForUser',
  userId?: string
): StorageAPI {
  const extraPayload = userId ? { userId } : {}

  return {
    async put<T extends object>(collection: string, id: string, data: T): Promise<void> {
      return sendRequest<void>(`storage.put${methodSuffix}`, { ...extraPayload, collection, id, data })
    },
    async get<T>(collection: string, id: string): Promise<T | undefined> {
      return sendRequest<T | undefined>(`storage.get${methodSuffix}`, { ...extraPayload, collection, id })
    },
    async delete(collection: string, id: string): Promise<boolean> {
      return sendRequest<boolean>(`storage.delete${methodSuffix}`, { ...extraPayload, collection, id })
    },
    async find<T>(collection: string, query?: Query, options?: QueryOptions): Promise<T[]> {
      return sendRequest<T[]>(`storage.find${methodSuffix}`, { ...extraPayload, collection, query, options })
    },
    async findOne<T>(collection: string, query: Query): Promise<T | undefined> {
      return sendRequest<T | undefined>(`storage.findOne${methodSuffix}`, { ...extraPayload, collection, query })
    },
    async count(collection: string, query?: Query): Promise<number> {
      return sendRequest<number>(`storage.count${methodSuffix}`, { ...extraPayload, collection, query })
    },
    async putMany<T extends object>(collection: string, docs: Array<{ id: string; data: T }>): Promise<void> {
      return sendRequest<void>(`storage.putMany${methodSuffix}`, { ...extraPayload, collection, docs })
    },
    async deleteMany(collection: string, query: Query): Promise<number> {
      return sendRequest<number>(`storage.deleteMany${methodSuffix}`, { ...extraPayload, collection, query })
    },
    async dropCollection(collection: string): Promise<void> {
      return sendRequest<void>(`storage.dropCollection${methodSuffix}`, { ...extraPayload, collection })
    },
    async listCollections(): Promise<string[]> {
      return sendRequest<string[]>(`storage.listCollections${methodSuffix}`, { ...extraPayload })
    },
  }
}

/**
 * Build extension-scoped storage API (shared across all users).
 */
export function buildExtensionStorageAPI(sendRequest: SendRequest): StorageAPI {
  return buildStorageAPI(sendRequest, '')
}

/**
 * Build user-scoped storage API (isolated per user).
 */
export function buildUserStorageAPI(sendRequest: SendRequest, userId: string): StorageAPI {
  return buildStorageAPI(sendRequest, 'ForUser', userId)
}
