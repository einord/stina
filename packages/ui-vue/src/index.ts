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

// Extension scope
export {
  useExtensionScope,
  provideExtensionScope,
  resolveValue,
  resolveComponentProps,
  isIterator,
  type ExtensionScope,
} from './composables/useExtensionScope.js'
export { default as ExtensionScopeProvider } from './components/extension-components/ExtensionScopeProvider.vue'
export { default as ExtensionComponent } from './components/extension-components/ExtensionComponent.vue'
export { default as ExtensionChildren } from './components/extension-components/ExtensionChildren.vue'

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
