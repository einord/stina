/**
 * Node.js Extension Host
 *
 * Platform-specific implementation using Worker Threads.
 * Used in: API server, Electron main process, TUI.
 */

import { Worker } from 'node:worker_threads'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  ExtensionManifest,
  HostToWorkerMessage,
  WorkerToHostMessage,
  StreamEvent,
  ChatMessage,
  ChatOptions,
  GetModelsOptions,
  ModelInfo,
  ToolResult,
  ActionResult,
  BackgroundTaskHealth,
} from '@stina/extension-api'
import { generateMessageId } from '@stina/extension-api'
import { ExtensionHost, type ExtensionHostOptions } from './ExtensionHost.js'
import { StreamingRequestManager } from './ExtensionHost.streaming.js'
import { PendingRequestManager } from './ExtensionHost.pending.js'
import { BackgroundTaskManager, type BackgroundTaskInfo } from './BackgroundTaskManager.js'
import { HandlerRegistry } from './ExtensionHost.handlers.js'
import { SettingsHandler } from './ExtensionHost.handlers.settings.js'
import { SchedulerHandler } from './ExtensionHost.handlers.scheduler.js'
import { UserHandler } from './ExtensionHost.handlers.user.js'
import { EventsHandler } from './ExtensionHost.handlers.events.js'
import { ChatHandler } from './ExtensionHost.handlers.chat.js'
import { NetworkHandler } from './ExtensionHost.handlers.network.js'
import { NewStorageHandler, type NewStorageCallbacks } from './ExtensionHost.handlers.newStorage.js'
import { SecretsHandler, type SecretsCallbacks } from './ExtensionHost.handlers.secrets.js'
import { ToolsRequestHandler } from './ExtensionHost.handlers.tools.js'

// ============================================================================
// Types
// ============================================================================

interface WorkerInfo {
  worker: Worker
  ready: boolean
  pendingActivation?: {
    resolve: () => void
    reject: (error: Error) => void
  }
}

export interface NodeExtensionHostOptions extends ExtensionHostOptions {
  /** Storage callbacks - if provided, enables storage.collections permission */
  storageCallbacks?: NewStorageCallbacks
  /** Secrets callbacks - if provided, enables secrets.manage permission */
  secretsCallbacks?: SecretsCallbacks
}

// ============================================================================
// Node Extension Host
// ============================================================================

/**
 * Node.js-specific extension host using Worker Threads
 */
export class NodeExtensionHost extends ExtensionHost {
  private readonly workers = new Map<string, WorkerInfo>()
  private readonly streamingManager = new StreamingRequestManager()
  /** Pending acknowledgments for streaming fetch chunks: Map<requestId, resolve callback> */
  private readonly pendingStreamAcks = new Map<string, () => void>()
  /** Pending request managers for different request types */
  private readonly toolPending = new PendingRequestManager(60000)
  private readonly actionPending = new PendingRequestManager(30000)
  private readonly modelsPending = new PendingRequestManager(30000)
  /** Background task manager for all extensions */
  private readonly backgroundTaskManager: BackgroundTaskManager
  private readonly nodeOptions: NodeExtensionHostOptions

  constructor(options: NodeExtensionHostOptions) {
    super(options)
    this.nodeOptions = options

    // Initialize background task manager
    this.backgroundTaskManager = new BackgroundTaskManager({
      logger: options.logger,
      sendStartTask: (extensionId, taskId) => {
        this.sendToWorker(extensionId, {
          type: 'background-task-start',
          id: generateMessageId(),
          payload: { taskId },
        })
      },
      sendStopTask: (extensionId, taskId) => {
        this.sendToWorker(extensionId, {
          type: 'background-task-stop',
          id: generateMessageId(),
          payload: { taskId },
        })
      },
    })

    // Forward background task events
    this.backgroundTaskManager.on('task-started', (extensionId, taskId) => {
      this.emit('background-task-started', extensionId, taskId)
    })
    this.backgroundTaskManager.on('task-stopped', (extensionId, taskId) => {
      this.emit('background-task-stopped', extensionId, taskId)
    })
    this.backgroundTaskManager.on('task-failed', (extensionId, taskId, error) => {
      this.emit('background-task-failed', extensionId, taskId, error)
    })
    this.backgroundTaskManager.on('task-restarting', (extensionId, taskId, restartCount, delayMs) => {
      this.emit('background-task-restarting', extensionId, taskId, restartCount, delayMs)
    })
    this.backgroundTaskManager.on('task-exhausted', (extensionId, taskId, restartCount) => {
      this.emit('background-task-exhausted', extensionId, taskId, restartCount)
    })
  }

  /**
   * Override to add Node.js-specific handlers for storage and secrets.
   */
  protected override createHandlerRegistry(): HandlerRegistry {
    const registry = new HandlerRegistry()
    const options = this.options as NodeExtensionHostOptions

    // Register platform-independent handlers
    registry.register(new SettingsHandler())
    registry.register(new SchedulerHandler())
    registry.register(new UserHandler())
    registry.register(new EventsHandler((event) => this.emit('extension-event', event)))
    registry.register(new ChatHandler())

    // Register platform-dependent handlers with callbacks
    registry.register(
      new NetworkHandler({
        fetch: (url, opts) => this.handleNetworkFetch(url, opts),
        fetchStream: (extensionId, requestId, url, opts) =>
          this.handleNetworkFetchStream(extensionId, requestId, url, opts),
      })
    )

    // Register tools cross-extension handler
    registry.register(new ToolsRequestHandler({
      listTools: () => this.getAllToolDefinitions(),
      executeTool: (toolId, params, userId) => this.executeToolCrossExtension(toolId, params, userId),
    }))

    // Register storage handler if callbacks are provided
    if (options.storageCallbacks) {
      registry.register(new NewStorageHandler(options.storageCallbacks))
    }

    // Register secrets handler if callbacks are provided
    if (options.secretsCallbacks) {
      registry.register(new SecretsHandler(options.secretsCallbacks))
    }

    return registry
  }

  /**
   * Load an extension from a directory path
   */
  async loadExtensionFromPath(extensionPath: string): Promise<void> {
    // Read manifest
    const manifestPath = join(extensionPath, 'manifest.json')
    const manifestContent = await readFile(manifestPath, 'utf-8')
    const manifest = JSON.parse(manifestContent) as ExtensionManifest

    // Debug: log manifest details
    const providers = manifest.contributes?.providers
    this.options.logger?.debug('loadExtensionFromPath: manifest loaded', {
      extensionId: manifest.id,
      providersCount: providers?.length ?? 0,
      providersWithConfigSchema: providers?.filter(p => !!p.configSchema).length ?? 0,
      providerIds: providers?.map(p => p.id) ?? [],
    })

    // Load the extension
    await this.loadExtension(manifest, extensionPath)
  }

  // ============================================================================
  // Abstract Method Implementations
  // ============================================================================

  protected async startWorker(
    extensionId: string,
    extensionPath: string,
    manifest: ExtensionManifest
  ): Promise<void> {
    const mainPath = join(extensionPath, manifest.main)
    // Convert to file:// URL to properly handle paths with spaces and special characters
    const mainUrl = pathToFileURL(mainPath).href

    // Create worker with the extension's entry point
    // The extension module should bundle the runtime and call initializeExtension() at the end
    // Wrap in async IIFE since eval mode doesn't support top-level await
    const workerCode = `
      (async () => {
        // Import the extension module - it should initialize itself
        // The extension's code calls initializeExtension() which sets up message handling
        await import('${mainUrl}');
      })();
    `

    const worker = new Worker(workerCode, {
      eval: true,
      workerData: { extensionId, extensionPath },
    })

    const workerInfo: WorkerInfo = {
      worker,
      ready: false,
    }

    // Set up message handling
    worker.on('message', (message: WorkerToHostMessage) => {
      this.options.logger?.debug('Worker message received', { extensionId, type: message.type })
      this.handleWorkerMessage(extensionId, message)

      // Handle ready state
      if (message.type === 'ready') {
        workerInfo.ready = true
        if (workerInfo.pendingActivation) {
          workerInfo.pendingActivation.resolve()
          workerInfo.pendingActivation = undefined
        }
      }
    })

    worker.on('error', (error) => {
      this.options.logger?.error('Worker error', { extensionId, error: error.message })
      this.emit('extension-error', extensionId, error)
      if (workerInfo.pendingActivation) {
        workerInfo.pendingActivation.reject(error)
        workerInfo.pendingActivation = undefined
      }
    })

    worker.on('exit', (code) => {
      if (code !== 0) {
        this.emit('extension-error', extensionId, new Error(`Worker exited with code ${code}`))
      }
      this.workers.delete(extensionId)
    })

    this.workers.set(extensionId, workerInfo)

    // Wait for worker to be ready
    await new Promise<void>((resolve, reject) => {
      workerInfo.pendingActivation = { resolve, reject }

      // Timeout after 10 seconds
      setTimeout(() => {
        if (workerInfo.pendingActivation) {
          workerInfo.pendingActivation.reject(new Error('Worker activation timeout'))
          workerInfo.pendingActivation = undefined
        }
      }, 10000)
    })
  }

  protected async stopWorker(extensionId: string): Promise<void> {
    const workerInfo = this.workers.get(extensionId)
    if (!workerInfo) return

    // Unregister all background tasks for this extension
    this.backgroundTaskManager.unregisterAllForExtension(extensionId)

    // Send deactivate message
    this.sendToWorker(extensionId, {
      type: 'deactivate',
      id: generateMessageId(),
    })

    // Give it a moment to clean up, then terminate
    await new Promise<void>((resolve) => {
      setTimeout(async () => {
        await workerInfo.worker.terminate()
        resolve()
      }, 1000)
    })

    // Reject all pending requests for this extension to avoid timeouts
    const reason = `Extension ${extensionId} was stopped`
    this.toolPending.rejectAll(reason)
    this.actionPending.rejectAll(reason)
    this.modelsPending.rejectAll(reason)

    this.workers.delete(extensionId)
  }

  protected sendToWorker(extensionId: string, message: HostToWorkerMessage): void {
    const workerInfo = this.workers.get(extensionId)
    if (!workerInfo) {
      throw new Error(`No worker found for extension ${extensionId}`)
    }
    workerInfo.worker.postMessage(message)
  }

  protected async handleNetworkFetch(
    url: string,
    options?: RequestInit
  ): Promise<{ status: number; statusText: string; headers: Record<string, string>; body: string }> {
    const response = await fetch(url, options)
    const body = await response.text()

    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      headers[key] = value
    })

    return {
      status: response.status,
      statusText: response.statusText,
      headers,
      body,
    }
  }

  protected async handleNetworkFetchStream(
    extensionId: string,
    requestId: string,
    url: string,
    options?: RequestInit
  ): Promise<void> {
    try {
      const response = await fetch(url, options)

      if (!response.ok) {
        this.sendToWorker(extensionId, {
          type: 'streaming-fetch-chunk',
          id: generateMessageId(),
          payload: {
            requestId,
            chunk: '',
            done: true,
            error: `HTTP ${response.status}: ${response.statusText}`,
          },
        })
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        this.sendToWorker(extensionId, {
          type: 'streaming-fetch-chunk',
          id: generateMessageId(),
          payload: {
            requestId,
            chunk: '',
            done: true,
            error: 'No response body available',
          },
        })
        return
      }

      const decoder = new TextDecoder()

      try {
        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            this.sendToWorker(extensionId, {
              type: 'streaming-fetch-chunk',
              id: generateMessageId(),
              payload: {
                requestId,
                chunk: '',
                done: true,
              },
            })
            // Wait for final acknowledgment before completing
            await new Promise<void>((resolve) => {
              this.pendingStreamAcks.set(requestId, resolve)
            })
            break
          }

          const chunk = decoder.decode(value, { stream: true })
          this.sendToWorker(extensionId, {
            type: 'streaming-fetch-chunk',
            id: generateMessageId(),
            payload: {
              requestId,
              chunk,
              done: false,
            },
          })

          // Wait for acknowledgment before sending next chunk (backpressure)
          await new Promise<void>((resolve) => {
            this.pendingStreamAcks.set(requestId, resolve)
          })
        }
      } finally {
        reader.releaseLock()
      }
    } catch (error) {
      this.sendToWorker(extensionId, {
        type: 'streaming-fetch-chunk',
        id: generateMessageId(),
        payload: {
          requestId,
          chunk: '',
          done: true,
          error: error instanceof Error ? error.message : String(error),
        },
      })
    }
  }

  protected async *sendProviderChatRequest(
    extensionId: string,
    providerId: string,
    messages: ChatMessage[],
    options: ChatOptions
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const requestId = generateMessageId()

    // Set up streaming request tracking using the manager
    this.streamingManager.create(requestId)

    // Send the request to the worker
    this.sendToWorker(extensionId, {
      type: 'provider-chat-request',
      id: requestId,
      payload: { providerId, messages, options },
    })

    // Use the manager's iterate method for clean event streaming
    yield* this.streamingManager.iterate(requestId)
  }

  protected async sendProviderModelsRequest(
    extensionId: string,
    providerId: string,
    options?: GetModelsOptions
  ): Promise<ModelInfo[]> {
    const requestId = generateMessageId()

    // Create pending request with automatic timeout handling
    const promise = this.modelsPending.create<ModelInfo[]>(requestId, {
      timeoutMessage: 'Models request timeout',
    })

    // Send the request
    this.sendToWorker(extensionId, {
      type: 'provider-models-request',
      id: requestId,
      payload: { providerId, options },
    })

    return promise
  }

  protected async sendToolExecuteRequest(
    extensionId: string,
    toolId: string,
    params: Record<string, unknown>,
    userId?: string
  ): Promise<ToolResult> {
    const requestId = generateMessageId()

    // Create pending request with automatic timeout handling
    const promise = this.toolPending.create<ToolResult>(requestId, {
      timeoutMessage: 'Tool execution timeout',
    })

    // Send the request with optional userId
    this.sendToWorker(extensionId, {
      type: 'tool-execute-request',
      id: requestId,
      payload: { toolId, params, userId },
    })

    return promise
  }

  protected async sendActionExecuteRequest(
    extensionId: string,
    actionId: string,
    params: Record<string, unknown>,
    userId?: string
  ): Promise<ActionResult> {
    const requestId = generateMessageId()

    // Create pending request with automatic timeout handling
    const promise = this.actionPending.create<ActionResult>(requestId, {
      timeoutMessage: 'Action execution timeout',
    })

    // Send the request with optional userId
    this.sendToWorker(extensionId, {
      type: 'action-execute-request',
      id: requestId,
      payload: { actionId, params, userId },
    })

    return promise
  }

  // Override to handle stream events and models responses
  protected override handleWorkerMessage(extensionId: string, message: WorkerToHostMessage): void {
    // Handle streaming fetch acknowledgments for backpressure control
    if (message.type === 'streaming-fetch-ack') {
      const { requestId } = message.payload
      const resolve = this.pendingStreamAcks.get(requestId)
      if (resolve) {
        this.pendingStreamAcks.delete(requestId)
        resolve()
      }
      return
    }

    // Handle stream events using the streaming manager
    if (message.type === 'stream-event') {
      const { requestId, event } = message.payload
      this.streamingManager.addEvent(requestId, event)
      return
    }

    // Handle provider models response using the pending manager
    if (message.type === 'provider-models-response') {
      const { requestId, models, error } = message.payload
      if (error) {
        this.modelsPending.reject(requestId, error)
      } else {
        this.modelsPending.resolve(requestId, models)
      }
      return
    }

    // Handle tool execute response using the pending manager
    if (message.type === 'tool-execute-response') {
      const { requestId, result, error } = message.payload
      if (error) {
        this.toolPending.reject(requestId, error)
      } else {
        this.toolPending.resolve(requestId, result)
      }
      return
    }

    // Handle action execute response using the pending manager
    if (message.type === 'action-execute-response') {
      const { requestId, result, error } = message.payload
      if (error) {
        this.actionPending.reject(requestId, error)
      } else {
        this.actionPending.resolve(requestId, result)
      }
      return
    }

    // Handle background task registered
    if (message.type === 'background-task-registered') {
      const extension = this.extensions.get(extensionId)
      if (!extension) return

      const check = extension.permissionChecker.checkBackgroundWorkersAccess()
      if (!check.allowed) {
        this.emit('log', {
          extensionId,
          level: 'error',
          message: check.reason || 'Background workers access denied',
        })
        return
      }

      const { taskId, name, userId, restartPolicy, payload } = message.payload
      this.backgroundTaskManager.registerTask(extensionId, taskId, name, userId, restartPolicy, payload)
      return
    }

    // Handle background task status update
    if (message.type === 'background-task-status') {
      const extension = this.extensions.get(extensionId)
      if (!extension) return

      const check = extension.permissionChecker.checkBackgroundWorkersAccess()
      if (!check.allowed) {
        this.emit('log', {
          extensionId,
          level: 'error',
          message: check.reason || 'Background workers access denied',
        })
        return
      }

      const { taskId, status, error } = message.payload
      this.backgroundTaskManager.handleTaskStatus(extensionId, taskId, status, error)
      return
    }

    // Handle background task health report
    if (message.type === 'background-task-health') {
      const extension = this.extensions.get(extensionId)
      if (!extension) return

      const check = extension.permissionChecker.checkBackgroundWorkersAccess()
      if (!check.allowed) {
        this.emit('log', {
          extensionId,
          level: 'error',
          message: check.reason || 'Background workers access denied',
        })
        return
      }

      const { taskId, status, timestamp } = message.payload
      this.backgroundTaskManager.handleHealthReport(extensionId, taskId, status, timestamp)
      return
    }

    // Delegate to parent
    super.handleWorkerMessage(extensionId, message)
  }

  /**
   * Get the number of active workers
   */
  getActiveWorkerCount(): number {
    return this.workers.size
  }

  /**
   * Check if a specific extension's worker is ready
   */
  isWorkerReady(extensionId: string): boolean {
    return this.workers.get(extensionId)?.ready ?? false
  }

  // ============================================================================
  // Background Task Methods
  // ============================================================================

  /**
   * Get all background tasks across all extensions
   */
  getBackgroundTasks(): BackgroundTaskHealth[] {
    return this.backgroundTaskManager.getAllTasks().map(this.taskInfoToHealth)
  }

  /**
   * Get background tasks for a specific extension
   */
  getBackgroundTasksForExtension(extensionId: string): BackgroundTaskHealth[] {
    return this.backgroundTaskManager.getTasksForExtension(extensionId).map(this.taskInfoToHealth)
  }

  /**
   * Convert internal task info to public health type
   */
  private taskInfoToHealth(task: BackgroundTaskInfo): BackgroundTaskHealth {
    return {
      taskId: task.taskId,
      name: task.name,
      userId: task.userId,
      status: task.status,
      restartCount: task.restartCount,
      lastHealthStatus: task.lastHealthStatus,
      lastHealthTime: task.lastHealthTime,
      error: task.error,
    }
  }
}
