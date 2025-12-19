// Hello
export { getGreeting } from './hello/getGreeting.js'

// Extensions
export type {
  ExtensionManifest,
  ExtensionPermission,
  ExtensionContributions,
  ExtensionCommand,
  ExtensionUiContributions,
  ExtensionPanel,
  ExtensionTheme,
} from './extensions/manifest.js'
export { ExtensionRegistry, extensionRegistry } from './extensions/registry.js'

// Themes
export type { ThemeTokens, Theme } from './themes/theme.js'
export { ThemeRegistry, themeRegistry } from './themes/themeRegistry.js'

// Errors
export { AppError, ErrorCode, ok, err } from './errors/AppError.js'
export type { Result } from './errors/AppError.js'

// Logging
export type { Logger } from './logging/logger.js'
export { noopLogger } from './logging/logger.js'

// Settings
export type { SettingsStore } from './settings/settingsStore.js'
export { APP_NAMESPACE, EXTENSIONS_NAMESPACE } from './settings/settingsStore.js'
