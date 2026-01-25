/**
 * @stina/extension-host
 *
 * Extension host for managing extension lifecycle and message routing.
 *
 * This package provides a platform-neutral base class and platform-specific
 * implementations:
 *
 * - NodeExtensionHost: For Node.js (API server, Electron main, TUI)
 * - WebExtensionHost: For browsers (Web app, Electron renderer)
 */

// Main host (abstract)
export { ExtensionHost } from './ExtensionHost.js'
export type {
  ExtensionInfo,
  LoadedExtension,
  ProviderInfo,
  ToolInfo,
  ActionInfo,
  ExtensionHostOptions,
  ExtensionHostEvents,
} from './ExtensionHost.js'

// Node.js implementation
export { NodeExtensionHost } from './NodeExtensionHost.js'
export type { NodeExtensionHostOptions } from './NodeExtensionHost.js'

// Web/Browser implementation
export { WebExtensionHost } from './WebExtensionHost.js'
export type { WebExtensionHostOptions } from './WebExtensionHost.js'

// Provider adapter (bridges extension-api to packages/chat)
export {
  createExtensionProviderAdapter,
  ExtensionProviderBridge,
} from './ExtensionProviderAdapter.js'
export type {
  ChatAIProvider,
  ChatStreamEvent,
  ChatSendMessageOptions,
} from './ExtensionProviderAdapter.js'

// Tool adapter (bridges extension tools to packages/chat ToolRegistry)
export { ExtensionToolBridge } from './ExtensionToolAdapter.js'
export type {
  AdaptedTool,
  ToolAddedCallback,
  ToolRemovedCallback,
  ToolExecutionContext,
} from './ExtensionToolAdapter.js'

// Permission checking
export { PermissionChecker } from './PermissionChecker.js'
export type { PermissionCheckResult } from './PermissionChecker.js'

// Manifest validation
export { validateManifest, parseManifest } from './ManifestValidator.js'
export type { ValidationResult } from './ManifestValidator.js'

// Re-export commonly used types from extension-api
export type {
  ExtensionManifest,
  Permission,
  SettingDefinition,
  ProviderDefinition,
  ToolDefinition,
  AIProvider,
  SchedulerJobRequest,
  SchedulerSchedule,
  SchedulerFirePayload,
  ChatInstructionMessage,
  StreamEvent,
  ChatMessage,
  ChatOptions,
  ModelInfo,
  ActionResult,
} from '@stina/extension-api'
