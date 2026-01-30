/**
 * Extension Context Types
 *
 * Types for extension context and available APIs.
 */

import type { AIProvider } from './types.provider.js'
import type { Tool, Action } from './types.tools.js'
import type { StorageAPI, SecretsAPI } from './types.storage.js'

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
 * ## Storage and Secrets
 *
 * The context provides both extension-scoped and user-scoped storage:
 * - `storage`: Extension-wide document storage (shared across all users)
 * - `userStorage`: User-specific document storage (isolated per user)
 * - `secrets`: Extension-wide secrets (shared across all users)
 * - `userSecrets`: User-specific secrets (isolated per user)
 *
 * @example
 * ```typescript
 * // In a tool execute handler:
 * execute: async (params, context) => {
 *   // Extension-wide storage (shared across all users)
 *   const config = await context.storage.get<Config>('settings', 'global-config')
 *
 *   // User-specific storage (isolated per user)
 *   const prefs = await context.userStorage.get<Preferences>('preferences', 'theme')
 *   await context.userStorage.put('preferences', 'theme', { mode: 'dark' })
 *
 *   // Secrets access
 *   const apiKey = await context.secrets.get('api-key')
 *   const userToken = await context.userSecrets.get('oauth-token')
 *
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

  /** Extension-scoped storage (same for all users) */
  readonly storage: StorageAPI

  /** User-scoped storage (isolated per user) */
  readonly userStorage: StorageAPI

  /** Extension-scoped secrets */
  readonly secrets: SecretsAPI

  /** User-scoped secrets */
  readonly userSecrets: SecretsAPI
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

  /** Collection-based document storage (if permitted) */
  readonly storage?: StorageAPI

  /** Secure secrets storage (if permitted) */
  readonly secrets?: SecretsAPI

  /** Background workers (if permitted) */
  readonly backgroundWorkers?: BackgroundWorkersAPI

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

// ============================================================================
// Background Workers API
// ============================================================================

/**
 * Restart policy for background tasks.
 * Controls how tasks are restarted after failures.
 */
export interface BackgroundRestartPolicy {
  /**
   * When to restart the task:
   * - 'always': Always restart, regardless of exit reason
   * - 'on-failure': Only restart if the task threw an error
   * - 'never': Never restart automatically
   */
  type: 'always' | 'on-failure' | 'never'

  /**
   * Maximum number of restarts before giving up.
   * 0 means unlimited restarts.
   * @default 0
   */
  maxRestarts?: number

  /**
   * Initial delay in milliseconds before first restart.
   * @default 1000
   */
  initialDelayMs?: number

  /**
   * Maximum delay in milliseconds between restarts.
   * @default 60000
   */
  maxDelayMs?: number

  /**
   * Multiplier for exponential backoff.
   * @default 2
   */
  backoffMultiplier?: number
}

/**
 * Configuration for a background task.
 */
export interface BackgroundTaskConfig {
  /**
   * Unique identifier for the task within the extension.
   * Used to reference the task for stopping or checking status.
   */
  id: string

  /**
   * Human-readable name for observability and logging.
   */
  name: string

  /**
   * User ID that owns this task.
   * Background tasks are always user-scoped.
   */
  userId: string

  /**
   * Policy for restarting the task after failures.
   */
  restartPolicy: BackgroundRestartPolicy

  /**
   * Optional payload data passed to the task callback.
   */
  payload?: Record<string, unknown>
}

/**
 * Context provided to background task callbacks.
 * Extends ExecutionContext with task-specific functionality.
 */
export interface BackgroundTaskContext extends ExecutionContext {
  /**
   * AbortSignal that is triggered when the task should stop.
   * Check this signal regularly and exit gracefully when aborted.
   */
  readonly signal: AbortSignal

  /**
   * Report the current health status of the task.
   * Use this to provide observability into what the task is doing.
   *
   * @param status Human-readable status message
   */
  reportHealth(status: string): void

  /**
   * Task-specific logging API.
   * Messages are tagged with the task ID for easier debugging.
   */
  readonly log: LogAPI
}

/**
 * Callback function for background tasks.
 * The function should run until the signal is aborted, then clean up and return.
 *
 * @example
 * ```typescript
 * const callback: BackgroundTaskCallback = async (ctx) => {
 *   const connection = await createConnection()
 *   try {
 *     while (!ctx.signal.aborted) {
 *       ctx.reportHealth('Waiting for messages...')
 *       const message = await connection.receive({ signal: ctx.signal })
 *       await processMessage(message)
 *     }
 *   } finally {
 *     await connection.close()
 *   }
 * }
 * ```
 */
export type BackgroundTaskCallback = (context: BackgroundTaskContext) => Promise<void>

/**
 * Health status of a background task.
 */
export interface BackgroundTaskHealth {
  /**
   * Unique task identifier within the extension.
   */
  taskId: string

  /**
   * Human-readable task name.
   */
  name: string

  /**
   * User ID that owns this task.
   */
  userId: string

  /**
   * Current task status.
   */
  status: 'pending' | 'running' | 'stopped' | 'failed' | 'restarting'

  /**
   * Number of times the task has been restarted.
   */
  restartCount: number

  /**
   * Last health status message reported by the task.
   */
  lastHealthStatus?: string

  /**
   * Timestamp of the last health report.
   */
  lastHealthTime?: string

  /**
   * Error message if the task failed.
   */
  error?: string
}

/**
 * API for managing background workers.
 * Background workers are long-running tasks that can be automatically restarted.
 *
 * @example
 * ```typescript
 * const task = await context.backgroundWorkers.start({
 *   id: 'my-task',
 *   name: 'My Background Task',
 *   userId: 'user-123',
 *   restartPolicy: { type: 'always', maxRestarts: 0 }
 * }, async (ctx) => {
 *   while (!ctx.signal.aborted) {
 *     // Do work...
 *   }
 * })
 *
 * // Later, to stop the task:
 * task.dispose()
 * ```
 */
export interface BackgroundWorkersAPI {
  /**
   * Start a new background task.
   *
   * @param config Task configuration
   * @param callback Function to execute as the background task
   * @returns Disposable that stops the task when disposed
   */
  start(config: BackgroundTaskConfig, callback: BackgroundTaskCallback): Promise<Disposable>

  /**
   * Stop a running background task.
   *
   * @param taskId The task ID to stop
   */
  stop(taskId: string): Promise<void>

  /**
   * Get the health status of all background tasks for this extension.
   *
   * @returns Array of task health statuses
   */
  getStatus(): Promise<BackgroundTaskHealth[]>
}
