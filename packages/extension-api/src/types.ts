/**
 * Extension API Types
 *
 * Re-exports all types from domain-specific files for backward compatibility.
 * Import individual domain files for better tree-shaking.
 */

// Localization
export type { LocalizedString } from './types.localization.js'
export { resolveLocalizedString } from './types.localization.js'

// Permissions
export type {
  Permission,
  NetworkPermission,
  StoragePermission,
  UserDataPermission,
  CapabilityPermission,
  SystemPermission,
} from './types.permissions.js'

// Contributions
export type {
  ExtensionContributions,
  // Settings
  SettingDefinition,
  SettingOptionsMapping,
  SettingCreateMapping,
  // Tool Settings Views
  ToolSettingsViewDefinition,
  ToolSettingsView,
  ToolSettingsListView,
  ToolSettingsListMapping,
  ToolSettingsComponentView,
  ToolSettingsActionDataSource,
  // Panels
  PanelDefinition,
  PanelView,
  PanelUnknownView,
  PanelActionDataSource,
  PanelComponentView,
  // Providers
  ProviderDefinition,
  ProviderConfigSchema,
  ProviderConfigPropertyType,
  ProviderConfigProperty,
  ProviderConfigSelectOption,
  ProviderConfigValidation,
  // Tools
  ToolDefinition,
  // Commands
  CommandDefinition,
  // Prompts
  PromptSection,
  PromptContribution,
} from './types.contributions.js'

// Manifest
export type { ExtensionManifest, Platform } from './types.manifest.js'

// Provider
export type {
  AIProvider,
  ModelInfo,
  ChatMessage,
  ToolCall,
  ChatOptions,
  GetModelsOptions,
  StreamEvent,
} from './types.provider.js'

// Tools and Actions
export type { Tool, ToolResult, Action, ActionResult } from './types.tools.js'

// Context and APIs
export type {
  Disposable,
  ExecutionContext,
  ExtensionContext,
  NetworkAPI,
  SettingsAPI,
  ProvidersAPI,
  ToolsAPI,
  ActionsAPI,
  EventsAPI,
  SchedulerSchedule,
  SchedulerJobRequest,
  SchedulerFirePayload,
  SchedulerAPI,
  UserProfile,
  UserAPI,
  ChatInstructionMessage,
  ChatAPI,
  LogAPI,
  ExtensionModule,
  // Background workers
  BackgroundRestartPolicy,
  BackgroundTaskConfig,
  BackgroundTaskContext,
  BackgroundTaskCallback,
  BackgroundTaskHealth,
  BackgroundWorkersAPI,
} from './types.context.js'

// Storage and Secrets
export type {
  Query,
  QueryOptions,
  StorageAPI,
  SecretsAPI,
  StorageCollectionConfig,
  StorageContributions,
} from './types.storage.js'
