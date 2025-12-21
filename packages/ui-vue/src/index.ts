// Components
export { default as AppShell } from './components/AppShell.vue'
export { default as GreetingCard } from './components/GreetingCard.vue'
export { default as HomePage } from './components/HomePage.vue'

// Theme
export { applyTheme } from './theme/applyTheme.js'
export { createThemeController } from './theme/themeController.js'

// API Client
export { useApi, apiClientKey } from './composables/useApi.js'
export type { ApiClient } from './composables/useApi.js'

// i18n
export {
  useI18n,
  provideI18n,
  t,
  initI18n as initI18nVue,
  setLang as setLangVue,
  getLang as getLangVue,
} from './composables/useI18n.js'

// Re-export ThemeTokens from core for convenience
export type { ThemeTokens, ThemeTokenName, ThemeTokenMeta } from '@stina/core'
