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
  ExtensionPromptContribution,
  ExtensionPromptSection,
} from './extensions/manifest.js'
export { ExtensionRegistry, extensionRegistry } from './extensions/registry.js'

// Themes
export type { ThemeTokens, Theme, ThemeTokenMeta, ThemeTokenName } from './themes/theme.js'
export { themeTokenSpec, themeTokenTree, withDefaultTokens, flattenThemeValues } from './themes/theme.js'
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

// Config
export type { ConnectionMode, ConnectionConfig } from './config/connectionConfig.js'
export { DEFAULT_CONNECTION_CONFIG, getApiUrl } from './config/connectionConfig.js'

// Redesign-2026 — Threads (see docs/redesign-2026/02-data-model.md §Thread)
export type {
  Thread,
  ThreadStatus,
  ThreadTrigger,
  StinaTriggerReason,
  EntityRef,
  EntityRefSnapshot,
} from './threads/types.js'

// Redesign-2026 — Messages (see docs/redesign-2026/02-data-model.md §Message)
export type {
  Message,
  MessageBase,
  MessageVisibility,
  UserMessage,
  StinaMessage,
  AppMessage,
  AppContent,
} from './messages/types.js'

// Redesign-2026 — Memory (see docs/redesign-2026/02-data-model.md §Memory, §03-memory.md)
export type {
  StandingInstruction,
  InstructionScope,
  InvalidationCondition,
  ProfileFact,
  ThreadSummary,
} from './memory/types.js'

// Redesign-2026 — Autonomy (see docs/redesign-2026/02-data-model.md §Tool severity, §06-autonomy.md)
export type {
  ToolSeverity,
  AutoPolicy,
  PolicyScope,
  ActivityLogEntry,
  ActivityLogKind,
  ToolManifestExtensions,
} from './autonomy/types.js'

// Redesign-2026 — Recall (see docs/redesign-2026/02-data-model.md §Recall API)
export type { RecallQuery, RecallResult, RecallScope } from './recall/types.js'
