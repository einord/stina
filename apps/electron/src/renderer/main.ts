import { createApp } from 'vue'
import App from './App.vue'
import { apiClientKey, createThemeController, provideI18n, installUi } from '@stina/ui-vue'
import { createIpcApiClient } from './api/client.js'
import '@stina/ui-vue/styles/reset.css'

const app = createApp(App)

// Initialize i18n (per-session detection)
provideI18n(app)
// Register shared UI components globally (Icon, etc.)
installUi(app)

// Provide the IPC-based API client
const apiClient = createIpcApiClient()
app.provide(apiClientKey, apiClient)

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
  if (import.meta.hot && apiClient.reloadThemes) {
    await apiClient.reloadThemes()
  }
  await themeController.initTheme()
}

initThemeWithReload()

// Hot-reapply theme when tokenSpec changes (dev)
if (import.meta.hot) {
  import.meta.hot.accept('@stina/core/src/themes/tokenSpec.ts', async () => {
    if (apiClient.reloadThemes) {
      await apiClient.reloadThemes()
    }
    await themeController.initTheme()
  })
}

app.mount('#app')
