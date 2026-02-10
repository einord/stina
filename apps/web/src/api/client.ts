import { createHttpApiClient as createBaseHttpApiClient } from '@stina/api-client'
import type { ApiClient } from '@stina/ui-vue'

const API_BASE = '/api'

/**
 * HTTP-based API client for the web app.
 * Uses localStorage for token storage and '/api' as base URL.
 */
export function createHttpApiClient(): ApiClient {
  return createBaseHttpApiClient({
    baseUrl: API_BASE,
    getAccessToken: () => localStorage.getItem('stina_access_token'),
  })
}

// Legacy exports for backward compatibility
export const fetchGreeting = (name?: string) => createHttpApiClient().getGreeting(name)
export const fetchThemes = () => createHttpApiClient().getThemes()
export const fetchThemeTokens = (id: string) => createHttpApiClient().getThemeTokens(id)
export const fetchExtensions = () => createHttpApiClient().getExtensions()
