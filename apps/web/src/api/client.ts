import type { Greeting, ThemeSummary, ExtensionSummary } from '@stina/shared'
import type { ThemeTokens, ApiClient } from '@stina/ui-vue'

const API_BASE = '/api'

/**
 * HTTP-based API client for the web app
 */
export function createHttpApiClient(): ApiClient {
  return {
    async getGreeting(name?: string): Promise<Greeting> {
      const url = name ? `${API_BASE}/hello?name=${encodeURIComponent(name)}` : `${API_BASE}/hello`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Failed to fetch greeting: ${response.statusText}`)
      }

      return response.json()
    },

    async getThemes(): Promise<ThemeSummary[]> {
      const response = await fetch(`${API_BASE}/themes`)

      if (!response.ok) {
        throw new Error(`Failed to fetch themes: ${response.statusText}`)
      }

      return response.json()
    },

    async getThemeTokens(id: string): Promise<ThemeTokens> {
      const response = await fetch(`${API_BASE}/themes/${encodeURIComponent(id)}`)

      if (!response.ok) {
        throw new Error(`Failed to fetch theme: ${response.statusText}`)
      }

      return response.json()
    },

    async getExtensions(): Promise<ExtensionSummary[]> {
      const response = await fetch(`${API_BASE}/extensions`)

      if (!response.ok) {
        throw new Error(`Failed to fetch extensions: ${response.statusText}`)
      }

      return response.json()
    },

    async health(): Promise<{ ok: boolean }> {
      const response = await fetch(`${API_BASE}/health`)

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.statusText}`)
      }

      return response.json()
    },

    // No-op in web; Electron implements for dev theme reloads
    async reloadThemes(): Promise<void> {
      return
    },
  }
}

// Legacy exports for backward compatibility
export const fetchGreeting = (name?: string) => createHttpApiClient().getGreeting(name)
export const fetchThemes = () => createHttpApiClient().getThemes()
export const fetchThemeTokens = (id: string) => createHttpApiClient().getThemeTokens(id)
export const fetchExtensions = () => createHttpApiClient().getExtensions()
