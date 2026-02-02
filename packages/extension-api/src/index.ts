/**
 * @stina/extension-api
 *
 * Types and utilities for building Stina extensions.
 *
 * Extensions should import from this package for type definitions.
 * The runtime (worker-side code) should import from '@stina/extension-api/runtime'.
 */

// Localization
export type { LocalizedString } from './types.js'
export { resolveLocalizedString } from './types.js'

// Types
export type {
  // Manifest
  ExtensionManifest,
  Platform,
  ExtensionContributions,
  SettingDefinition,
  SettingOptionsMapping,
  SettingCreateMapping,
  ToolSettingsViewDefinition,
  ToolSettingsView,
  ToolSettingsListView,
  ToolSettingsListMapping,
  ToolSettingsComponentView,
  ToolSettingsActionDataSource,
  PanelDefinition,
  PanelView,
  PanelComponentView,
  PanelActionDataSource,
  PanelUnknownView,
  ProviderDefinition,
  PromptContribution,
  PromptSection,
  ToolDefinition,
  ToolConfirmationConfig,
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
  ActionsAPI,
  EventsAPI,
  SchedulerAPI,
  SchedulerJobRequest,
  SchedulerSchedule,
  SchedulerFirePayload,
  UserAPI,
  UserProfile,
  ChatAPI,
  ChatInstructionMessage,
  LogAPI,

  // Background workers
  BackgroundWorkersAPI,
  BackgroundTaskConfig,
  BackgroundTaskCallback,
  BackgroundTaskContext,
  BackgroundTaskHealth,
  BackgroundRestartPolicy,

  // Storage and Secrets
  Query,
  QueryOptions,
  StorageAPI,
  SecretsAPI,
  StorageCollectionConfig,
  StorageContributions,

  // AI Provider
  AIProvider,
  ModelInfo,
  ChatMessage,
  ChatOptions,
  GetModelsOptions,
  StreamEvent,
  ToolCall,

  // Tools
  Tool,
  ToolResult,

  // Actions
  Action,
  ActionResult,

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
  ToolExecuteResponseMessage,
  ActionExecuteRequestMessage,
  ActionExecuteResponseMessage,
  ResponseMessage,
  ReadyMessage,
  RequestMessage,
  RequestMethod,
  ProviderRegisteredMessage,
  ToolRegisteredMessage,
  ActionRegisteredMessage,
  StreamEventMessage,
  LogMessage,
  PendingRequest,
  // Background task messages
  BackgroundTaskStartMessage,
  BackgroundTaskStopMessage,
  BackgroundTaskRegisteredMessage,
  BackgroundTaskStatusMessage,
  BackgroundTaskHealthMessage,
} from './messages.js'

export { generateMessageId } from './messages.js'

// Component types (for extension UI components)
export type {
  // Styling
  AllowedCSSProperty,
  ExtensionComponentStyle,
  // Base types
  ExtensionComponentData,
  // Iteration & Children
  ExtensionComponentIterator,
  ExtensionComponentChildren,
  // Actions
  ExtensionActionCall,
  ExtensionActionRef,
  // Data Sources & Panel Definition
  ExtensionDataSource,
  ExtensionPanelDefinition,
  // Component Props
  HeaderProps,
  LabelProps,
  ParagraphProps,
  ButtonProps,
  TextInputProps,
  DateTimeInputProps,
  SelectProps,
  VerticalStackProps,
  HorizontalStackProps,
  GridProps,
  DividerProps,
  IconProps,
  IconButtonType,
  IconButtonProps,
  PanelAction,
  PanelProps,
  ToggleProps,
  CollapsibleProps,
  PillVariant,
  PillProps,
  CheckboxProps,
  MarkdownProps,
  ModalProps,
  ConditionalGroupProps,
} from './types.components.js'
