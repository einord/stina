import type { ApiClient } from '@stina/ui-vue'

/**
 * IPC-based API client for Electron renderer
 * Communicates with main process via preload-exposed electronAPI
 */
export function createIpcApiClient(): ApiClient {
  const api = window.electronAPI

  if (!api) {
    throw new Error('electronAPI not available. Are you running in Electron?')
  }

  return {
    getGreeting: (name?: string) => api.getGreeting(name),
    getThemes: () => api.getThemes(),
    getThemeTokens: (id: string) => api.getThemeTokens(id),
    getExtensions: () => api.getExtensions(),
    health: () => api.health(),
  }
}
