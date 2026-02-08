import { inject } from 'vue'
import type { ApiClient } from '@stina/api-client'

// Re-export types from api-client for backward compatibility
export type {
  ApiClient,
  ExtensionSettingsResponse,
  ProviderInfo,
  ToolSettingsViewInfo,
  PanelViewInfo,
  ExtensionToolInfo,
  ActionInfo,
  ExtensionEvent,
  ChatEvent,
  ChatStreamEvent,
  ChatStreamOptions,
} from '@stina/api-client'

/** Injection key for ApiClient */
export const apiClientKey = Symbol('apiClient') as symbol

/**
 * Composable to access the API client
 * The actual implementation is provided by the app (web or electron)
 */
export function useApi(): ApiClient {
  const client = inject<ApiClient>(apiClientKey)
  if (!client) {
    throw new Error('ApiClient not provided. Make sure to provide it in the app root.')
  }
  return client
}
