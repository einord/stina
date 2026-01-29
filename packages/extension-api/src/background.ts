/**
 * Background Task Manager (Worker-side)
 *
 * Manages background tasks running inside the extension worker.
 * Handles task execution, AbortController management, and health reporting.
 */

import type {
  BackgroundTaskConfig,
  BackgroundTaskCallback,
  BackgroundTaskContext,
  BackgroundTaskHealth,
  Disposable,
  LogAPI,
  StorageAPI,
  SecretsAPI,
} from './types.js'

// ============================================================================
// Types
// ============================================================================

/**
 * Internal representation of a registered task
 */
interface RegisteredTask {
  config: BackgroundTaskConfig
  callback: BackgroundTaskCallback
  abortController: AbortController | null
  status: 'pending' | 'running' | 'stopped' | 'failed'
  lastHealthStatus?: string
  lastHealthTime?: string
  error?: string
}

/**
 * Options for the WorkerBackgroundTaskManager
 */
export interface WorkerBackgroundTaskManagerOptions {
  extensionId: string
  extensionVersion: string
  storagePath: string
  /** Send a message to the host */
  sendTaskRegistered: (
    taskId: string,
    name: string,
    userId: string,
    restartPolicy: BackgroundTaskConfig['restartPolicy'],
    payload?: Record<string, unknown>
  ) => void
  /** Send status update to host */
  sendTaskStatus: (taskId: string, status: 'running' | 'stopped' | 'failed', error?: string) => void
  /** Send health report to host */
  sendHealthReport: (taskId: string, status: string, timestamp: string) => void
  /** Create a log API for a task */
  createLogAPI: (taskId: string) => LogAPI
  /** Create extension-scoped storage API */
  createStorageAPI: () => StorageAPI
  /** Create user-scoped storage API */
  createUserStorageAPI: (userId: string) => StorageAPI
  /** Create extension-scoped secrets API */
  createSecretsAPI: () => SecretsAPI
  /** Create user-scoped secrets API */
  createUserSecretsAPI: (userId: string) => SecretsAPI
}

// ============================================================================
// WorkerBackgroundTaskManager
// ============================================================================

/**
 * Manages background tasks within the extension worker.
 */
export class WorkerBackgroundTaskManager {
  private readonly tasks = new Map<string, RegisteredTask>()
  private readonly options: WorkerBackgroundTaskManagerOptions

  constructor(options: WorkerBackgroundTaskManagerOptions) {
    this.options = options
  }

  /**
   * Register and start a background task.
   * @returns A disposable that stops the task when disposed
   */
  async start(config: BackgroundTaskConfig, callback: BackgroundTaskCallback): Promise<Disposable> {
    const { id: taskId } = config

    if (this.tasks.has(taskId)) {
      throw new Error(`Background task with id '${taskId}' is already registered`)
    }

    const task: RegisteredTask = {
      config,
      callback,
      abortController: null,
      status: 'pending',
    }

    this.tasks.set(taskId, task)

    // Notify host about the registration
    this.options.sendTaskRegistered(
      taskId,
      config.name,
      config.userId,
      config.restartPolicy,
      config.payload
    )

    // Return a disposable that stops the task
    // Task removal should be coordinated with the host to avoid race conditions
    return {
      dispose: () => {
        this.stop(taskId)
        // Don't immediately delete - let the task finish aborting
        // The task will be cleaned up when the extension is deactivated
      },
    }
  }

  /**
   * Stop a running task.
   */
  stop(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task) {
      return
    }

    // Abort the task if it's running
    if (task.abortController) {
      task.abortController.abort()
      task.abortController = null
    }

    task.status = 'stopped'

    // Notify host that the task has been stopped
    this.options.sendTaskStatus(taskId, 'stopped')
  }

  /**
   * Handle start message from host.
   * This is called when the host tells us to actually run the task.
   */
  async handleStart(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) {
      return
    }

    // If there's already an execution running, abort it first
    if (task.abortController) {
      task.abortController.abort()
      task.abortController = null
    }

    // Create new AbortController for this run
    task.abortController = new AbortController()
    task.status = 'running'
    task.error = undefined

    // Build the task context
    const context = this.buildTaskContext(task)

    // Notify host that we're running
    this.options.sendTaskStatus(taskId, 'running')

    try {
      // Execute the callback
      await task.callback(context)

      // Task completed normally (or was aborted)
      if (task.abortController?.signal.aborted) {
        task.status = 'stopped'
        this.options.sendTaskStatus(taskId, 'stopped')
      } else {
        // Task finished without being aborted - treat as stopped
        task.status = 'stopped'
        this.options.sendTaskStatus(taskId, 'stopped')
      }
    } catch (error) {
      // Task failed with an error
      const errorMessage = error instanceof Error ? error.message : String(error)
      task.status = 'failed'
      task.error = errorMessage
      this.options.sendTaskStatus(taskId, 'failed', errorMessage)
    } finally {
      task.abortController = null
    }
  }

  /**
   * Handle stop message from host.
   */
  handleStop(taskId: string): void {
    this.stop(taskId)
  }

  /**
   * Build the execution context for a task.
   */
  private buildTaskContext(task: RegisteredTask): BackgroundTaskContext {
    const { config, abortController } = task
    const signal = abortController!.signal

    const log = this.options.createLogAPI(config.id)

    // Create storage and secrets APIs
    const storage = this.options.createStorageAPI()
    const userStorage = config.userId
      ? this.options.createUserStorageAPI(config.userId)
      : storage
    const secrets = this.options.createSecretsAPI()
    const userSecrets = config.userId
      ? this.options.createUserSecretsAPI(config.userId)
      : secrets

    const context: BackgroundTaskContext = {
      userId: config.userId,
      extension: {
        id: this.options.extensionId,
        version: this.options.extensionVersion,
        storagePath: this.options.storagePath,
      },
      storage,
      userStorage,
      secrets,
      userSecrets,
      signal,
      reportHealth: (status: string) => {
        const timestamp = new Date().toISOString()
        task.lastHealthStatus = status
        task.lastHealthTime = timestamp
        this.options.sendHealthReport(config.id, status, timestamp)
      },
      log,
    }

    return context
  }

  /**
   * Get the status of all tasks.
   */
  getStatus(): BackgroundTaskHealth[] {
    const result: BackgroundTaskHealth[] = []

    for (const task of this.tasks.values()) {
      result.push({
        taskId: task.config.id,
        name: task.config.name,
        userId: task.config.userId,
        status: task.status,
        restartCount: 0, // Worker doesn't track restarts, host does
        lastHealthStatus: task.lastHealthStatus,
        lastHealthTime: task.lastHealthTime,
        error: task.error,
      })
    }

    return result
  }

  /**
   * Check if a task exists.
   */
  hasTask(taskId: string): boolean {
    return this.tasks.has(taskId)
  }

  /**
   * Clean up all tasks.
   * Called during extension deactivation.
   */
  dispose(): void {
    for (const task of this.tasks.values()) {
      if (task.abortController) {
        task.abortController.abort()
      }
    }
    this.tasks.clear()
  }
}
