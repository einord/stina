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
} from '@stina/extension-api'
import { generateMessageId } from '@stina/extension-api'
import { ExtensionHost, type ExtensionHostOptions } from './ExtensionHost.js'
import { StreamingRequestManager } from './ExtensionHost.streaming.js'
import { PendingRequestManager } from './ExtensionHost.pending.js'

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
  /**
   * Function to execute database queries for extensions.
   * Should validate that queries only access extension-prefixed tables.
   */
  databaseExecutor?: (extensionId: string, sql: string, params?: unknown[]) => Promise<unknown[]>
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
  /** Global/extension-scoped storage: Map<extensionId, Map<key, value>> */
  private readonly extensionStorage = new Map<string, Map<string, unknown>>()
  /** User-scoped storage: Map<extensionId:userId, Map<key, value>> */
  private readonly userScopedStorage = new Map<string, Map<string, unknown>>()
  private readonly nodeOptions: NodeExtensionHostOptions

  constructor(options: NodeExtensionHostOptions) {
    super(options)
    this.nodeOptions = options
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

    this.workers.delete(extensionId)
    this.extensionStorage.delete(extensionId)
    // Clean up user-scoped storage for this extension
    for (const key of this.userScopedStorage.keys()) {
      if (key.startsWith(`${extensionId}:`)) {
        this.userScopedStorage.delete(key)
      }
    }
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

  protected async handleDatabaseExecute(
    extensionId: string,
    sql: string,
    params?: unknown[]
  ): Promise<unknown[]> {
    if (!this.nodeOptions.databaseExecutor) {
      throw new Error('Database access not configured')
    }
    return this.nodeOptions.databaseExecutor(extensionId, sql, params)
  }

  protected async handleStorageGet(extensionId: string, key: string): Promise<unknown> {
    const storage = this.extensionStorage.get(extensionId)
    return storage?.get(key)
  }

  protected async handleStorageSet(extensionId: string, key: string, value: unknown): Promise<void> {
    let storage = this.extensionStorage.get(extensionId)
    if (!storage) {
      storage = new Map()
      this.extensionStorage.set(extensionId, storage)
    }
    storage.set(key, value)
  }

  protected async handleStorageDelete(extensionId: string, key: string): Promise<void> {
    const storage = this.extensionStorage.get(extensionId)
    storage?.delete(key)
  }

  protected async handleStorageKeys(extensionId: string): Promise<string[]> {
    const storage = this.extensionStorage.get(extensionId)
    return storage ? Array.from(storage.keys()) : []
  }

  // User-scoped storage methods
  private buildUserStorageKey(extensionId: string, userId: string): string {
    return `${extensionId}:${userId}`
  }

  protected async handleStorageGetForUser(extensionId: string, userId: string, key: string): Promise<unknown> {
    const storageKey = this.buildUserStorageKey(extensionId, userId)
    const storage = this.userScopedStorage.get(storageKey)
    return storage?.get(key)
  }

  protected async handleStorageSetForUser(extensionId: string, userId: string, key: string, value: unknown): Promise<void> {
    const storageKey = this.buildUserStorageKey(extensionId, userId)
    let storage = this.userScopedStorage.get(storageKey)
    if (!storage) {
      storage = new Map()
      this.userScopedStorage.set(storageKey, storage)
    }
    storage.set(key, value)
  }

  protected async handleStorageDeleteForUser(extensionId: string, userId: string, key: string): Promise<void> {
    const storageKey = this.buildUserStorageKey(extensionId, userId)
    const storage = this.userScopedStorage.get(storageKey)
    storage?.delete(key)
  }

  protected async handleStorageKeysForUser(extensionId: string, userId: string): Promise<string[]> {
    const storageKey = this.buildUserStorageKey(extensionId, userId)
    const storage = this.userScopedStorage.get(storageKey)
    return storage ? Array.from(storage.keys()) : []
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
}
