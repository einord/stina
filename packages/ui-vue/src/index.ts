// Components
export { default as AppShell } from './components/AppShell.vue'
export { default as Icon } from './components/common/Icon.vue'

// Theme
export { applyTheme } from './theme/applyTheme.js'
export { createThemeController } from './theme/themeController.js'

// API Client
export { useApi, apiClientKey } from './composables/useApi.js'
export type {
  ApiClient,
  ExtensionSettingsResponse,
  ExtensionEvent,
  ProviderInfo,
  PanelViewInfo,
  ToolSettingsViewInfo,
} from './composables/useApi.js'

// i18n
export {
  useI18n,
  provideI18n,
  t,
  initI18n as initI18nVue,
  setLang as setLangVue,
  getLang as getLangVue,
} from './composables/useI18n.js'

// Plugin for global component registration
export { installUi } from './plugin.js'

// Re-export ThemeTokens from core for convenience
export type { ThemeTokens, ThemeTokenName, ThemeTokenMeta } from '@stina/core'

// Re-export extension types for convenience
export type {
  RegistryEntry,
  ExtensionListItem,
  ExtensionDetails,
  InstalledExtension,
  InstallResult,
  ExtensionCategory,
  VersionInfo,
} from '@stina/extension-installer'
