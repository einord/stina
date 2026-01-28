/**
 * Background Task Manager
 *
 * Manages the lifecycle of background tasks registered by extensions.
 * Handles restart policies with exponential backoff.
 */

import EventEmitter from 'eventemitter3'

// ============================================================================
// Types
// ============================================================================

/**
 * Restart policy configuration
 */
export interface RestartPolicy {
  type: 'always' | 'on-failure' | 'never'
  maxRestarts: number
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
}

/**
 * Information about a registered background task
 */
export interface BackgroundTaskInfo {
  taskId: string
  extensionId: string
  name: string
  userId: string
  restartPolicy: RestartPolicy
  payload?: Record<string, unknown>
  status: 'pending' | 'running' | 'stopped' | 'failed' | 'restarting'
  restartCount: number
  lastHealthStatus?: string
  lastHealthTime?: string
  error?: string
  restartTimer?: ReturnType<typeof setTimeout>
}

/**
 * Events emitted by BackgroundTaskManager
 */
export interface BackgroundTaskManagerEvents {
  'task-started': (extensionId: string, taskId: string) => void
  'task-stopped': (extensionId: string, taskId: string) => void
  'task-failed': (extensionId: string, taskId: string, error: string) => void
  'task-restarting': (extensionId: string, taskId: string, restartCount: number, delayMs: number) => void
  'task-exhausted': (extensionId: string, taskId: string, restartCount: number) => void
  'task-health': (extensionId: string, taskId: string, status: string) => void
}

/**
 * Options for BackgroundTaskManager
 */
export interface BackgroundTaskManagerOptions {
  logger?: {
    debug(message: string, context?: Record<string, unknown>): void
    info(message: string, context?: Record<string, unknown>): void
    warn(message: string, context?: Record<string, unknown>): void
    error(message: string, context?: Record<string, unknown>): void
  }
  /** Callback to send start message to worker */
  sendStartTask: (extensionId: string, taskId: string) => void
  /** Callback to send stop message to worker */
  sendStopTask: (extensionId: string, taskId: string) => void
}

// ============================================================================
// BackgroundTaskManager
// ============================================================================

/**
 * Manages background tasks for all extensions.
 * Handles task registration, lifecycle management, and restart policies.
 */
export class BackgroundTaskManager extends EventEmitter<BackgroundTaskManagerEvents> {
  /** Tasks indexed by compound key: extensionId:taskId */
  private readonly tasks = new Map<string, BackgroundTaskInfo>()
  private readonly options: BackgroundTaskManagerOptions

  constructor(options: BackgroundTaskManagerOptions) {
    super()
    this.options = options
  }

  /**
   * Build a compound key for task lookup
   */
  private buildKey(extensionId: string, taskId: string): string {
    return `${extensionId}:${taskId}`
  }

  /**
   * Register a new background task.
   * Called when a worker sends a background-task-registered message.
   */
  registerTask(
    extensionId: string,
    taskId: string,
    name: string,
    userId: string,
    restartPolicy: Partial<RestartPolicy> & { type: RestartPolicy['type'] },
    payload?: Record<string, unknown>
  ): void {
    const key = this.buildKey(extensionId, taskId)

    if (this.tasks.has(key)) {
      this.options.logger?.warn('Task already registered, ignoring', { extensionId, taskId })
      return
    }

    const fullPolicy: RestartPolicy = {
      type: restartPolicy.type,
      maxRestarts: restartPolicy.maxRestarts ?? 0,
      initialDelayMs: restartPolicy.initialDelayMs ?? 1000,
      maxDelayMs: restartPolicy.maxDelayMs ?? 60000,
      backoffMultiplier: restartPolicy.backoffMultiplier ?? 2,
    }

    const task: BackgroundTaskInfo = {
      taskId,
      extensionId,
      name,
      userId,
      restartPolicy: fullPolicy,
      payload,
      status: 'pending',
      restartCount: 0,
    }

    this.tasks.set(key, task)
    this.options.logger?.info('Background task registered', { extensionId, taskId, name, userId })

    // Immediately start the task
    this.startTask(extensionId, taskId)
  }

  /**
   * Start a task by sending a start message to the worker.
   */
  private startTask(extensionId: string, taskId: string): void {
    const key = this.buildKey(extensionId, taskId)
    const task = this.tasks.get(key)

    if (!task) {
      this.options.logger?.warn('Cannot start unknown task', { extensionId, taskId })
      return
    }

    task.status = 'running'
    task.error = undefined
    this.options.sendStartTask(extensionId, taskId)
    this.emit('task-started', extensionId, taskId)
    this.options.logger?.info('Background task started', { extensionId, taskId })
  }

  /**
   * Handle task status update from worker.
   */
  handleTaskStatus(extensionId: string, taskId: string, status: 'running' | 'stopped' | 'failed', error?: string): void {
    const key = this.buildKey(extensionId, taskId)
    const task = this.tasks.get(key)

    if (!task) {
      this.options.logger?.warn('Status update for unknown task', { extensionId, taskId, status })
      return
    }

    this.options.logger?.debug('Task status update', { extensionId, taskId, status, error })

    switch (status) {
      case 'running':
        task.status = 'running'
        task.error = undefined
        break

      case 'stopped':
        task.status = 'stopped'
        this.emit('task-stopped', extensionId, taskId)
        this.options.logger?.info('Background task stopped', { extensionId, taskId })

        // Handle restart policy for 'always'
        if (task.restartPolicy.type === 'always') {
          this.scheduleRestart(task)
        }
        break

      case 'failed':
        task.status = 'failed'
        task.error = error
        this.emit('task-failed', extensionId, taskId, error || 'Unknown error')
        this.options.logger?.error('Background task failed', { extensionId, taskId, error })

        // Handle restart policy for 'always' or 'on-failure'
        if (task.restartPolicy.type === 'always' || task.restartPolicy.type === 'on-failure') {
          this.scheduleRestart(task)
        }
        break
    }
  }

  /**
   * Handle health report from worker.
   */
  handleHealthReport(extensionId: string, taskId: string, status: string, timestamp: string): void {
    const key = this.buildKey(extensionId, taskId)
    const task = this.tasks.get(key)

    if (!task) {
      return
    }

    task.lastHealthStatus = status
    task.lastHealthTime = timestamp
    this.emit('task-health', extensionId, taskId, status)
    this.options.logger?.debug('Task health report', { extensionId, taskId, status })
  }

  /**
   * Schedule a restart with exponential backoff.
   */
  private scheduleRestart(task: BackgroundTaskInfo): void {
    const { extensionId, taskId, restartPolicy, restartCount } = task

    // Check max restarts (0 means unlimited)
    if (restartPolicy.maxRestarts > 0 && restartCount >= restartPolicy.maxRestarts) {
      task.status = 'failed'
      this.emit('task-exhausted', extensionId, taskId, restartCount)
      this.options.logger?.warn('Task exhausted max restarts', { extensionId, taskId, restartCount })
      return
    }

    // Calculate delay with exponential backoff
    const delay = Math.min(
      restartPolicy.initialDelayMs * Math.pow(restartPolicy.backoffMultiplier, restartCount),
      restartPolicy.maxDelayMs
    )

    task.status = 'restarting'
    task.restartCount++

    this.emit('task-restarting', extensionId, taskId, task.restartCount, delay)
    this.options.logger?.info('Scheduling task restart', {
      extensionId,
      taskId,
      restartCount: task.restartCount,
      delayMs: delay,
    })

    // Clear any existing timer
    if (task.restartTimer) {
      clearTimeout(task.restartTimer)
    }

    task.restartTimer = setTimeout(() => {
      task.restartTimer = undefined
      this.startTask(extensionId, taskId)
    }, delay)
  }

  /**
   * Stop a task gracefully.
   */
  stopTask(extensionId: string, taskId: string): void {
    const key = this.buildKey(extensionId, taskId)
    const task = this.tasks.get(key)

    if (!task) {
      this.options.logger?.warn('Cannot stop unknown task', { extensionId, taskId })
      return
    }

    // Clear any pending restart
    if (task.restartTimer) {
      clearTimeout(task.restartTimer)
      task.restartTimer = undefined
    }

    // Mark as stopped to prevent automatic restart
    task.status = 'stopped'

    // Send stop message to worker
    this.options.sendStopTask(extensionId, taskId)
    this.options.logger?.info('Stop signal sent to task', { extensionId, taskId })
  }

  /**
   * Unregister a task completely.
   * Called when the task is disposed or the extension is unloaded.
   */
  unregisterTask(extensionId: string, taskId: string): void {
    const key = this.buildKey(extensionId, taskId)
    const task = this.tasks.get(key)

    if (!task) {
      return
    }

    // Clear any pending restart timer
    if (task.restartTimer) {
      clearTimeout(task.restartTimer)
    }

    this.tasks.delete(key)
    this.options.logger?.info('Background task unregistered', { extensionId, taskId })
  }

  /**
   * Unregister all tasks for an extension.
   * Called when an extension is unloaded.
   */
  unregisterAllForExtension(extensionId: string): void {
    const tasksToRemove: string[] = []

    for (const [key, task] of this.tasks) {
      if (task.extensionId === extensionId) {
        // Clear any pending restart timer
        if (task.restartTimer) {
          clearTimeout(task.restartTimer)
        }
        tasksToRemove.push(key)
      }
    }

    for (const key of tasksToRemove) {
      this.tasks.delete(key)
    }

    if (tasksToRemove.length > 0) {
      this.options.logger?.info('Unregistered all tasks for extension', {
        extensionId,
        count: tasksToRemove.length,
      })
    }
  }

  /**
   * Get all tasks for an extension.
   */
  getTasksForExtension(extensionId: string): BackgroundTaskInfo[] {
    const result: BackgroundTaskInfo[] = []
    for (const task of this.tasks.values()) {
      if (task.extensionId === extensionId) {
        result.push(task)
      }
    }
    return result
  }

  /**
   * Get all tasks across all extensions.
   */
  getAllTasks(): BackgroundTaskInfo[] {
    return Array.from(this.tasks.values())
  }

  /**
   * Get a specific task.
   */
  getTask(extensionId: string, taskId: string): BackgroundTaskInfo | undefined {
    return this.tasks.get(this.buildKey(extensionId, taskId))
  }
}
