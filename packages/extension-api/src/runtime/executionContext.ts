/**
 * Shared execution context builder for tool, action, and scheduler operations.
 */

import type { ExecutionContext, ExtensionContext } from '../types.js'
import type { RequestMessage } from '../messages.js'
import { buildExtensionStorageAPI, buildUserStorageAPI } from './storageApi.js'
import { buildExtensionSecretsAPI, buildUserSecretsAPI } from './secretsApi.js'

type SendRequest = <T>(method: RequestMessage['method'], payload: unknown) => Promise<T>

/**
 * Create a request-scoped ExecutionContext with storage and secrets.
 * Used by scheduler fire, tool execution, and action execution handlers.
 */
export function createExecutionContext(
  sendRequest: SendRequest,
  extensionContext: ExtensionContext,
  userId?: string
): ExecutionContext {
  return {
    userId,
    extension: {
      id: extensionContext.extension.id,
      version: extensionContext.extension.version,
      storagePath: extensionContext.extension.storagePath,
    },
    storage: buildExtensionStorageAPI(sendRequest),
    userStorage: userId
      ? buildUserStorageAPI(sendRequest, userId)
      : buildExtensionStorageAPI(sendRequest),
    secrets: buildExtensionSecretsAPI(sendRequest),
    userSecrets: userId
      ? buildUserSecretsAPI(sendRequest, userId)
      : buildExtensionSecretsAPI(sendRequest),
  }
}
