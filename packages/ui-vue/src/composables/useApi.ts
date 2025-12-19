import { inject } from 'vue'
import type { Greeting, ThemeSummary, ExtensionSummary } from '@stina/shared'
import type { ThemeTokens } from '@stina/core'

/**
 * API client interface that can be implemented differently for web (HTTP) and Electron (IPC)
 */
export interface ApiClient {
  /** Get a greeting message */
  getGreeting(name?: string): Promise<Greeting>

  /** Get list of available themes */
  getThemes(): Promise<ThemeSummary[]>

  /** Get theme tokens by id */
  getThemeTokens(id: string): Promise<ThemeTokens>

  /** Get list of registered extensions */
  getExtensions(): Promise<ExtensionSummary[]>

  /** Health check */
  health(): Promise<{ ok: boolean }>
}

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
