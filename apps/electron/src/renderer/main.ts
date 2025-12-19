import { createApp } from 'vue'
import App from './App.vue'
import { apiClientKey, applyTheme } from '@stina/ui-vue'
import { createIpcApiClient } from './api/client.js'

const app = createApp(App)

// Provide the IPC-based API client
const apiClient = createIpcApiClient()
app.provide(apiClientKey, apiClient)

// Initialize theme
async function initTheme() {
  try {
    const themes = await apiClient.getThemes()
    // Default to dark theme
    const defaultTheme = themes.find((t) => t.id === 'dark') || themes[0]
    if (defaultTheme) {
      const tokens = await apiClient.getThemeTokens(defaultTheme.id)
      applyTheme(tokens)
    }
  } catch (error) {
    console.error('Failed to initialize theme:', error)
  }
}

initTheme()

app.mount('#app')
