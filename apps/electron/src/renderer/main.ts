import { createApp } from 'vue'
import App from './App.vue'
import { apiClientKey, createThemeController } from '@stina/ui-vue'
import { createIpcApiClient } from './api/client.js'
import '@stina/ui-vue/styles/reset.css'

const app = createApp(App)

// Provide the IPC-based API client
const apiClient = createIpcApiClient()
app.provide(apiClientKey, apiClient)

// Initialize theme (shared logic with web)
const themeController = createThemeController({
  listThemes: () => apiClient.getThemes(),
  getThemeTokens: (id: string) => apiClient.getThemeTokens(id),
  log: (message, error) => console.error(message, error),
})
themeController.initTheme()

// Hot-reapply theme when tokenSpec changes (dev)
if (import.meta.hot) {
  import.meta.hot.accept('../../packages/core/src/themes/tokenSpec.ts', async () => {
    await themeController.initTheme()
  })
}

app.mount('#app')
