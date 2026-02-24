/**
 * Extension Host Types
 *
 * Type definitions for the extension host system.
 */

import type {
  ExtensionManifest,
  ProviderConfigSchema,
  LocalizedString,
  SchedulerJobRequest,
  ChatInstructionMessage,
  UserProfile,
} from '@stina/extension-api'
import type { PermissionChecker } from './PermissionChecker.js'

// ============================================================================
// Extension Info Types
// ============================================================================

/**
 * Basic information about an extension
 */
export interface ExtensionInfo {
  id: string
  manifest: ExtensionManifest
  status: 'loading' | 'active' | 'error' | 'disabled'
  error?: string
}

/**
 * A fully loaded and active extension with runtime state
 */
export interface LoadedExtension extends ExtensionInfo {
  status: 'active'
  permissionChecker: PermissionChecker
  settings: Record<string, unknown>
  registeredProviders: Map<string, ProviderInfo>
  registeredTools: Map<string, ToolInfo>
  registeredActions: Map<string, ActionInfo>
}

// ============================================================================
// Provider, Tool, and Action Info
// ============================================================================

/**
 * Information about a registered provider
 */
export interface ProviderInfo {
  id: string
  name: string
  extensionId: string
  /** Schema for provider-specific configuration UI */
  configSchema?: ProviderConfigSchema
  /** Default settings for this provider */
  defaultSettings?: Record<string, unknown>
}

/**
 * Information about a registered tool
 */
export interface ToolInfo {
  id: string
  /** Display name - can be a simple string or localized strings */
  name: LocalizedString
  /** Description - can be a simple string or localized strings */
  description: LocalizedString
  parameters?: Record<string, unknown>
  extensionId: string
}

/**
 * Information about a registered action
 */
export interface ActionInfo {
  id: string
  extensionId: string
}

// ============================================================================
// Extension Host Options
// ============================================================================

/**
 * Options for configuring the extension host
 */
export interface ExtensionHostOptions {
  storagePath?: string
  logger?: {
    debug(message: string, context?: Record<string, unknown>): void
    info(message: string, context?: Record<string, unknown>): void
    warn(message: string, context?: Record<string, unknown>): void
    error(message: string, context?: Record<string, unknown>): void
  }
  scheduler?: {
    schedule: (extensionId: string, job: SchedulerJobRequest) => Promise<void>
    cancel: (extensionId: string, jobId: string) => Promise<void>
    updateJobResult: (extensionId: string, jobId: string, success: boolean, error?: string) => Promise<void>
  }
  chat?: {
    appendInstruction: (extensionId: string, message: ChatInstructionMessage) => Promise<void>
  }
  user?: {
    getProfile: (extensionId: string) => Promise<UserProfile>
    listIds: () => Promise<string[]>
  }
}

// ============================================================================
// Extension Host Events
// ============================================================================

/**
 * Events emitted by the extension host
 */
export interface ExtensionHostEvents {
  'extension-loaded': (extension: ExtensionInfo) => void
  'extension-error': (extensionId: string, error: Error) => void
  'extension-unloaded': (extensionId: string) => void
  'provider-registered': (provider: ProviderInfo) => void
  'provider-unregistered': (providerId: string) => void
  'tool-registered': (tool: ToolInfo) => void
  'tool-unregistered': (toolId: string) => void
  'action-registered': (action: ActionInfo) => void
  'action-unregistered': (actionId: string) => void
  'extension-event': (event: {
    extensionId: string
    name: string
    payload?: Record<string, unknown>
  }) => void
  log: (args: { extensionId: string; level: string; message: string; context?: Record<string, unknown> }) => void
  // Background task events
  'background-task-started': (extensionId: string, taskId: string) => void
  'background-task-stopped': (extensionId: string, taskId: string) => void
  'background-task-failed': (extensionId: string, taskId: string, error: string) => void
  'background-task-restarting': (extensionId: string, taskId: string, restartCount: number, delayMs: number) => void
  'background-task-exhausted': (extensionId: string, taskId: string, restartCount: number) => void
}

// ============================================================================
// Request Handling Types
// ============================================================================

/**
 * A pending request awaiting response from a worker
 */
export interface PendingRequest<T = unknown> {
  resolve: (value: T) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}
