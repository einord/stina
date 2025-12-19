// Components
export { default as AppShell } from './components/AppShell.vue'
export { default as AppBadge } from './components/AppBadge.vue'
export { default as GreetingCard } from './components/GreetingCard.vue'
export { default as HomePage } from './components/HomePage.vue'

// Theme
export { applyTheme } from './theme/applyTheme.js'
export { createThemeController } from './theme/themeController.js'

// API Client
export { useApi, apiClientKey } from './composables/useApi.js'
export type { ApiClient } from './composables/useApi.js'

// Re-export ThemeTokens from core for convenience
export type { ThemeTokens, ThemeTokenName, ThemeTokenMeta } from '@stina/core'
