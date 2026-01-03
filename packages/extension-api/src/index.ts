/**
 * @stina/extension-api
 *
 * Types and utilities for building Stina extensions.
 *
 * Extensions should import from this package for type definitions.
 * The runtime (worker-side code) should import from '@stina/extension-api/runtime'.
 */

// Types
export type {
  // Manifest
  ExtensionManifest,
  Platform,
  ExtensionContributions,
  SettingDefinition,
  ProviderDefinition,
  ToolDefinition,
  CommandDefinition,

  // Provider Configuration Schema
  ProviderConfigSchema,
  ProviderConfigProperty,
  ProviderConfigPropertyType,
  ProviderConfigSelectOption,
  ProviderConfigValidation,

  // Permissions
  Permission,
  NetworkPermission,
  StoragePermission,
  UserDataPermission,
  CapabilityPermission,
  SystemPermission,

  // Context
  ExtensionContext,
  Disposable,
  NetworkAPI,
  SettingsAPI,
  ProvidersAPI,
  ToolsAPI,
  DatabaseAPI,
  StorageAPI,
  LogAPI,

  // AI Provider
  AIProvider,
  ModelInfo,
  ChatMessage,
  ChatOptions,
  GetModelsOptions,
  StreamEvent,

  // Tools
  Tool,
  ToolResult,

  // Entry point
  ExtensionModule,
} from './types.js'

// Messages (for host implementation)
export type {
  HostToWorkerMessage,
  WorkerToHostMessage,
  ActivateMessage,
  DeactivateMessage,
  SettingsChangedMessage,
  ProviderChatRequestMessage,
  ProviderModelsRequestMessage,
  ToolExecuteRequestMessage,
  ResponseMessage,
  ReadyMessage,
  RequestMessage,
  RequestMethod,
  ProviderRegisteredMessage,
  ToolRegisteredMessage,
  StreamEventMessage,
  LogMessage,
  PendingRequest,
} from './messages.js'

export { generateMessageId } from './messages.js'
