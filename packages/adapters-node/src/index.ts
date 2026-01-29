// Database
export { getDb, closeDb, getRawDb } from './db/connection.js'
export type { DB } from './db/connection.js'
export { runMigrations, initCoreSchema } from './db/migrate.js'
export { initDatabase, getDatabase } from './db/appDatabase.js'
export type { DatabaseInitOptions } from './db/appDatabase.js'
export * as schema from './db/schema.js'

// Extensions
export { loadExtensions } from './extensions/loader.js'
export {
  builtinExtensions,
  darkThemeExtension,
  lightThemeExtension,
} from './extensions/builtins.js'
export {
  createNodeExtensionRuntime,
  getPanelViews,
  getToolSettingsViews,
  mapExtensionManifestToCore,
  syncEnabledExtensions,
} from './extensions/runtime.js'
export type {
  PanelViewInfo,
  ToolSettingsViewInfo,
  SyncEnabledExtensionsOptions,
  SyncEnabledExtensionsResult,
} from './extensions/runtime.js'
export { createExtensionDatabaseExecutor } from './extensions/databaseExecutor.js'
export { deleteExtensionData } from './extensions/extensionDataCleanup.js'
export type { ExtensionDataCleanupResult } from './extensions/extensionDataCleanup.js'

// Logging
export { createConsoleLogger, getLogLevelFromEnv } from './logging/consoleLogger.js'
export type { LogLevel } from './logging/consoleLogger.js'

// Settings
export { EncryptedSettingsStore, deriveKey } from './settings/encryptedSettingsStore.js'

// Paths
export { getAppDataDir, getDbPath, getExtensionsPath, getConfigPath, getLogsPath } from './paths.js'
