import { createApp } from 'vue'
import App from './App.vue'
import { apiClientKey, createThemeController, provideI18n, installUi } from '@stina/ui-vue'
import { createHttpApiClient } from './api/client.js'
import '@stina/ui-vue/styles/reset.css'

const app = createApp(App)

// Initialize i18n (per-session detection)
provideI18n(app)
// Register shared UI components globally (Icon, etc.)
installUi(app)

// Provide the HTTP-based API client
const apiClient = createHttpApiClient()
app.provide(apiClientKey, apiClient)

// Initialize theme
const themeController = createThemeController({
  listThemes: () => apiClient.getThemes(),
  getThemeTokens: (id: string) => apiClient.getThemeTokens(id),
})
themeController.initTheme()

// Hot-reapply theme when tokenSpec changes (dev)
if (import.meta.hot) {
  import.meta.hot.accept('../../packages/core/src/themes/tokenSpec.ts', async () => {
    await themeController.initTheme()
  })
}

app.mount('#app')
