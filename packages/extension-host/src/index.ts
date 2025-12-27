/**
 * @stina/extension-host
 *
 * Extension host for managing extension lifecycle and message routing.
 *
 * This package provides a platform-neutral base class and platform-specific
 * implementations:
 *
 * - NodeExtensionHost: For Node.js (API server, Electron main, TUI)
 * - BrowserExtensionHost: For browsers (Web app, Electron renderer) - TODO
 */

// Main host (abstract)
export { ExtensionHost } from './ExtensionHost.js'
export type {
  ExtensionInfo,
  LoadedExtension,
  ProviderInfo,
  ToolInfo,
  ExtensionHostOptions,
  ExtensionHostEvents,
} from './ExtensionHost.js'

// Node.js implementation
export { NodeExtensionHost } from './NodeExtensionHost.js'
export type { NodeExtensionHostOptions } from './NodeExtensionHost.js'

// Provider adapter (bridges extension-api to packages/chat)
export {
  createExtensionProviderAdapter,
  ExtensionProviderBridge,
} from './ExtensionProviderAdapter.js'
export type {
  ChatAIProvider,
  ChatStreamEvent,
} from './ExtensionProviderAdapter.js'

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
  StreamEvent,
  ChatMessage,
  ChatOptions,
  ModelInfo,
} from '@stina/extension-api'
