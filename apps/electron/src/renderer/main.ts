import { createApp } from 'vue'
import App from './App.vue'
import { apiClientKey, createThemeController, provideI18n, installUi, type ApiClient } from '@stina/ui-vue'
import { createIpcApiClient } from './api/client.js'
import { createRemoteApiClient } from './api/remoteClient.js'
import type { ConnectionConfig } from '@stina/core'
import '@stina/ui-vue/styles/reset.css'

/**
 * Symbol for providing connection config to components.
 * Using Symbol.for() to allow sharing between modules.
 */
export const connectionConfigKey = Symbol.for('stina:connectionConfig')

/**
 * Initialize the application with the appropriate API client based on connection config.
 */
async function initializeApp(): Promise<void> {
  // Get connection config from main process
  const config: ConnectionConfig = await window.electronAPI.connectionGetConfig()

  // Create the appropriate API client based on mode
  let apiClient: ApiClient
  if (config.mode === 'remote' && config.webUrl) {
    apiClient = createRemoteApiClient(config.webUrl)
  } else {
    apiClient = createIpcApiClient()
  }

  const app = createApp(App)

  // Initialize i18n (per-session detection)
  provideI18n(app)
  // Register shared UI components globally (Icon, etc.)
  installUi(app)

  // Provide the API client and connection config
  app.provide(apiClientKey, apiClient)
  app.provide(connectionConfigKey, config)

  // Initialize theme (shared logic with web)
  const themeController = createThemeController(
    {
      listThemes: () => apiClient.getThemes(),
      getThemeTokens: (id: string) => apiClient.getThemeTokens(id),
    },
    {
      log: (message: string, error?: unknown) => console.error(message, error),
    }
  )

  const initThemeWithReload = async () => {
    // In dev we can ask main process to rebuild theme registry to pick up tokenSpec changes
    // Only do this in local mode
    if (import.meta.hot && config.mode === 'local' && apiClient.reloadThemes) {
      await apiClient.reloadThemes()
    }
    await themeController.initTheme()
  }

  initThemeWithReload()

  // Hot-reapply theme when tokenSpec changes (dev, local mode only)
  if (import.meta.hot && config.mode === 'local') {
    import.meta.hot.accept('@stina/core/src/themes/tokenSpec.ts', async () => {
      if (apiClient.reloadThemes) {
        await apiClient.reloadThemes()
      }
      await themeController.initTheme()
    })
  }

  app.mount('#app')
}

// Start the app
initializeApp().catch((error) => {
  console.error('Failed to initialize app:', error)
})
