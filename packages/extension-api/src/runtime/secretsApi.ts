/**
 * Secrets API builders for extension and user-scoped secrets.
 */

import type { SecretsAPI } from '../types.js'
import type { RequestMessage } from '../messages.js'

type SendRequest = <T>(method: RequestMessage['method'], payload: unknown) => Promise<T>

/**
 * Build extension-scoped secrets API (shared across all users).
 */
export function buildExtensionSecretsAPI(sendRequest: SendRequest): SecretsAPI {
  return {
    async set(key: string, value: string): Promise<void> {
      return sendRequest<void>('secrets.set', { key, value })
    },
    async get(key: string): Promise<string | undefined> {
      return sendRequest<string | undefined>('secrets.get', { key })
    },
    async delete(key: string): Promise<boolean> {
      return sendRequest<boolean>('secrets.delete', { key })
    },
    async list(): Promise<string[]> {
      return sendRequest<string[]>('secrets.list', {})
    },
  }
}

/**
 * Build user-scoped secrets API (isolated per user).
 */
export function buildUserSecretsAPI(sendRequest: SendRequest, userId: string): SecretsAPI {
  return {
    async set(key: string, value: string): Promise<void> {
      return sendRequest<void>('secrets.setForUser', { userId, key, value })
    },
    async get(key: string): Promise<string | undefined> {
      return sendRequest<string | undefined>('secrets.getForUser', { userId, key })
    },
    async delete(key: string): Promise<boolean> {
      return sendRequest<boolean>('secrets.deleteForUser', { userId, key })
    },
    async list(): Promise<string[]> {
      return sendRequest<string[]>('secrets.listForUser', { userId })
    },
  }
}
