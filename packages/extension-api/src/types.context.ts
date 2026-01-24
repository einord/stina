/**
 * Extension Context Types
 *
 * Types for extension context and available APIs.
 */

import type { AIProvider } from './types.provider.js'
import type { Tool, Action } from './types.tools.js'

/**
 * Disposable resource that can be cleaned up
 */
export interface Disposable {
  dispose(): void
}

/**
 * Request-scoped execution context for tool, action, and scheduler operations.
 *
 * This context is passed to every tool and action execute() call, providing
 * request-specific information without relying on global mutable state.
 *
 * ## Why Request-Scoped Context?
 *
 * Using request-scoped context instead of global state:
 * - Eliminates race conditions (no global userId that can change mid-execution)
 * - Provides cleaner architecture with explicit data flow
 * - Makes code easier to reason about and debug
 * - Allows scheduler jobs to create context for the correct user
 *
 * @example
 * ```typescript
 * // In a tool execute handler:
 * execute: async (params, context) => {
 *   if (context.userId) {
 *     // User-specific logic
 *     const userData = await storage.getForUser(context.userId, 'preferences')
 *   }
 *   // Access extension metadata
 *   console.log(`Running in extension ${context.extension.id}`)
 * }
 * ```
 */
export interface ExecutionContext {
  /**
   * User ID for the current request.
   * Undefined only for system/global operations during extension activation.
   * Always defined for tool executions, action executions, and scheduler callbacks.
   */
  readonly userId?: string

  /** Extension metadata */
  readonly extension: {
    readonly id: string
    readonly version: string
    readonly storagePath: string
  }
}

/**
 * Context provided to extension's activate function.
 *
 * Note: This context is for extension activation only. For tool/action execution,
 * use the ExecutionContext parameter passed to execute() methods.
 */
export interface ExtensionContext {
  /** Extension metadata */
  readonly extension: {
    readonly id: string
    readonly version: string
    readonly storagePath: string
  }

  /** Network access (if permitted) */
  readonly network?: NetworkAPI

  /** Settings access (if permitted) */
  readonly settings?: SettingsAPI

  /** Provider registration (if permitted) */
  readonly providers?: ProvidersAPI

  /** Tool registration (if permitted) */
  readonly tools?: ToolsAPI

  /** Action registration (if permitted) */
  readonly actions?: ActionsAPI

  /** Event emission (if permitted) */
  readonly events?: EventsAPI

  /** Scheduler access (if permitted) */
  readonly scheduler?: SchedulerAPI

  /** User data access (if permitted) */
  readonly user?: UserAPI

  /** Chat access (if permitted) */
  readonly chat?: ChatAPI

  /** Database access (if permitted) */
  readonly database?: DatabaseAPI

  /** Local storage (if permitted) */
  readonly storage?: StorageAPI

  /** Logging (always available) */
  readonly log: LogAPI
}

/**
 * Network API for making HTTP requests
 */
export interface NetworkAPI {
  /**
   * Fetch a URL (permissions are enforced by host)
   */
  fetch(url: string, options?: RequestInit): Promise<Response>

  /**
   * Streaming fetch for responses like NDJSON or SSE.
   * Yields text chunks as they arrive from the server.
   *
   * @throws {Error} If the request fails or encounters a network error.
   * The error message will contain details about the failure.
   *
   * @example
   * ```typescript
   * try {
   *   for await (const chunk of context.network.fetchStream(url, options)) {
   *     // Process each chunk (may contain partial lines)
   *     buffer += chunk
   *   }
   * } catch (error) {
   *   console.error('Streaming fetch failed:', error.message)
   * }
   * ```
   */
  fetchStream(url: string, options?: RequestInit): AsyncGenerator<string, void, unknown>
}

/**
 * Settings API for reading/writing extension settings
 */
export interface SettingsAPI {
  /**
   * Get all settings for this extension
   */
  getAll<T extends Record<string, unknown>>(): Promise<T>

  /**
   * Get a specific setting value
   */
  get<T>(key: string): Promise<T | undefined>

  /**
   * Set a setting value
   */
  set(key: string, value: unknown): Promise<void>

  /**
   * Listen for setting changes
   */
  onChange(callback: (key: string, value: unknown) => void): Disposable
}

/**
 * Providers API for registering AI providers
 */
export interface ProvidersAPI {
  /**
   * Register an AI provider
   */
  register(provider: AIProvider): Disposable
}

/**
 * Tools API for registering tools
 */
export interface ToolsAPI {
  /**
   * Register a tool that Stina can use
   */
  register(tool: Tool): Disposable
}

/**
 * Actions API for registering UI actions
 */
export interface ActionsAPI {
  /**
   * Register an action that UI components can invoke
   */
  register(action: Action): Disposable
}

/**
 * Events API for notifying the host
 */
export interface EventsAPI {
  /**
   * Emit a named event with optional payload
   */
  emit(name: string, payload?: Record<string, unknown>): Promise<void>
}

/**
 * Scheduler schedule types
 */
export type SchedulerSchedule =
  | { type: 'at'; at: string }
  | { type: 'cron'; cron: string; timezone?: string }
  | { type: 'interval'; everyMs: number }

/**
 * Scheduler job request
 */
export interface SchedulerJobRequest {
  id: string
  schedule: SchedulerSchedule
  payload?: Record<string, unknown>
  misfire?: 'run_once' | 'skip'
  /**
   * User ID for the job owner.
   * All scheduled jobs must be associated with a user. The userId
   * will be passed to the extension when the job fires via ExecutionContext.
   */
  userId: string
}

/**
 * Scheduler fire payload
 */
export interface SchedulerFirePayload {
  id: string
  payload?: Record<string, unknown>
  scheduledFor: string
  firedAt: string
  delayMs: number
  /** User ID for the job owner */
  userId: string
}

/**
 * Scheduler API for registering jobs
 */
export interface SchedulerAPI {
  schedule(job: SchedulerJobRequest): Promise<void>
  cancel(jobId: string): Promise<void>
  /**
   * Register a callback for when scheduled jobs fire.
   * The callback receives both the fire payload and an ExecutionContext
   * with userId if the job was created with a userId.
   */
  onFire(callback: (payload: SchedulerFirePayload, context: ExecutionContext) => void | Promise<void>): Disposable
}

/**
 * User profile data
 */
export interface UserProfile {
  firstName?: string
  nickname?: string
  language?: string
  timezone?: string
}

/**
 * User API for profile access
 */
export interface UserAPI {
  getProfile(): Promise<UserProfile>
}

/**
 * Chat instruction message
 */
export interface ChatInstructionMessage {
  text: string
  conversationId?: string
  userId?: string
}

/**
 * Chat API for appending instructions
 */
export interface ChatAPI {
  appendInstruction(message: ChatInstructionMessage): Promise<void>
}

/**
 * Database API for extension-specific tables
 */
export interface DatabaseAPI {
  /**
   * Execute a SQL query (only extension's prefixed tables allowed)
   */
  execute<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>
}

/**
 * Simple key-value storage API with support for user-scoped storage.
 *
 * ## Global vs User-Scoped Storage
 *
 * Extensions have access to two types of storage:
 * - **Global storage**: Shared across all users, accessed via `get()`, `set()`, etc.
 * - **User-scoped storage**: Isolated per user, accessed via `getForUser()`, `setForUser()`, etc.
 *
 * Use global storage for extension-wide settings and user-scoped storage for
 * user preferences, session data, or any data that should be private to a user.
 *
 * @example
 * ```typescript
 * // Global storage (extension-wide)
 * await storage.set('apiEndpoint', 'https://api.example.com')
 * const endpoint = await storage.get<string>('apiEndpoint')
 *
 * // User-scoped storage (per-user)
 * if (context.userId) {
 *   await storage.setForUser(context.userId, 'preferences', { theme: 'dark' })
 *   const prefs = await storage.getForUser<Preferences>(context.userId, 'preferences')
 * }
 * ```
 */
export interface StorageAPI {
  /**
   * Get a value by key (global/extension-scoped)
   */
  get<T>(key: string): Promise<T | undefined>

  /**
   * Set a value (global/extension-scoped)
   */
  set(key: string, value: unknown): Promise<void>

  /**
   * Delete a key (global/extension-scoped)
   */
  delete(key: string): Promise<void>

  /**
   * Get all keys (global/extension-scoped)
   */
  keys(): Promise<string[]>

  /**
   * Get a value by key for a specific user (user-scoped)
   * @param userId The user ID
   * @param key The storage key
   */
  getForUser<T>(userId: string, key: string): Promise<T | undefined>

  /**
   * Set a value for a specific user (user-scoped)
   * @param userId The user ID
   * @param key The storage key
   * @param value The value to store
   */
  setForUser(userId: string, key: string, value: unknown): Promise<void>

  /**
   * Delete a key for a specific user (user-scoped)
   * @param userId The user ID
   * @param key The storage key
   */
  deleteForUser(userId: string, key: string): Promise<void>

  /**
   * Get all keys for a specific user (user-scoped)
   * @param userId The user ID
   */
  keysForUser(userId: string): Promise<string[]>
}

/**
 * Logging API
 */
export interface LogAPI {
  debug(message: string, data?: Record<string, unknown>): void
  info(message: string, data?: Record<string, unknown>): void
  warn(message: string, data?: Record<string, unknown>): void
  error(message: string, data?: Record<string, unknown>): void
}

/**
 * Extension entry point interface
 */
export interface ExtensionModule {
  /**
   * Called when extension is activated
   */
  activate(context: ExtensionContext): void | Disposable | Promise<void | Disposable>

  /**
   * Called when extension is deactivated
   */
  deactivate?(): void | Promise<void>
}
