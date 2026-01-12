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

interface StreamingRequest {
  events: StreamEvent[]
  done: boolean
  error?: Error
  resolve?: () => void
  reject?: (error: Error) => void
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
  private readonly streamingRequests = new Map<string, StreamingRequest>()
  private readonly extensionStorage = new Map<string, Map<string, unknown>>()
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
    const workerCode = `
      // Just import the extension module - it should initialize itself
      // The extension's code calls initializeExtension() which sets up message handling
      await import('${mainUrl}');
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

  protected async *sendProviderChatRequest(
    extensionId: string,
    providerId: string,
    messages: ChatMessage[],
    options: ChatOptions
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const requestId = generateMessageId()

    // Set up streaming request tracking
    const streamingRequest: StreamingRequest = {
      events: [],
      done: false,
    }
    this.streamingRequests.set(requestId, streamingRequest)

    // Send the request to the worker
    this.sendToWorker(extensionId, {
      type: 'provider-chat-request',
      id: requestId,
      payload: { providerId, messages, options },
    })

    try {
      // Yield events as they come in
      while (!streamingRequest.done) {
        // Wait for events
        await new Promise<void>((resolve, reject) => {
          streamingRequest.resolve = resolve
          streamingRequest.reject = reject

          // Check if we already have events
          if (streamingRequest.events.length > 0 || streamingRequest.done) {
            resolve()
          }
        })

        // Yield all pending events
        while (streamingRequest.events.length > 0) {
          const event = streamingRequest.events.shift()!
          if (event.type === 'done') {
            streamingRequest.done = true
          } else if (event.type === 'error') {
            throw new Error(event.message)
          }
          yield event
        }
      }
    } finally {
      this.streamingRequests.delete(requestId)
    }
  }

  protected async sendProviderModelsRequest(
    extensionId: string,
    providerId: string,
    options?: GetModelsOptions
  ): Promise<ModelInfo[]> {
    const requestId = generateMessageId()

    return new Promise((resolve, reject) => {
      // Set up one-time response handler
      const timeout = setTimeout(() => {
        reject(new Error('Models request timeout'))
      }, 30000)

      // Store the pending request
      const pendingKey = `models:${requestId}`
      this.pendingRequests.set(pendingKey, {
        resolve: (data) => {
          clearTimeout(timeout)
          resolve(data as ModelInfo[])
        },
        reject: (error) => {
          clearTimeout(timeout)
          reject(error)
        },
        timeout,
      })

      // Send the request
      this.sendToWorker(extensionId, {
        type: 'provider-models-request',
        id: requestId,
        payload: { providerId, options },
      })
    })
  }

  protected async sendToolExecuteRequest(
    extensionId: string,
    toolId: string,
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    const requestId = generateMessageId()

    return new Promise((resolve, reject) => {
      // Set up timeout (tools may take longer, use 60 seconds)
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(`tool:${requestId}`)
        reject(new Error('Tool execution timeout'))
      }, 60000)

      // Store the pending request
      const pendingKey = `tool:${requestId}`
      this.pendingRequests.set(pendingKey, {
        resolve: (data) => {
          clearTimeout(timeout)
          resolve(data as ToolResult)
        },
        reject: (error) => {
          clearTimeout(timeout)
          reject(error)
        },
        timeout,
      })

      // Send the request
      this.sendToWorker(extensionId, {
        type: 'tool-execute-request',
        id: requestId,
        payload: { toolId, params },
      })
    })
  }

  protected async sendActionExecuteRequest(
    extensionId: string,
    actionId: string,
    params: Record<string, unknown>
  ): Promise<ActionResult> {
    const requestId = generateMessageId()

    return new Promise((resolve, reject) => {
      // Set up timeout (actions should be quick, use 30 seconds)
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(`action:${requestId}`)
        reject(new Error('Action execution timeout'))
      }, 30000)

      // Store the pending request
      const pendingKey = `action:${requestId}`
      this.pendingRequests.set(pendingKey, {
        resolve: (data) => {
          clearTimeout(timeout)
          resolve(data as ActionResult)
        },
        reject: (error) => {
          clearTimeout(timeout)
          reject(error)
        },
        timeout,
      })

      // Send the request
      this.sendToWorker(extensionId, {
        type: 'action-execute-request',
        id: requestId,
        payload: { actionId, params },
      })
    })
  }

  // Override to handle stream events and models responses
  protected override handleWorkerMessage(extensionId: string, message: WorkerToHostMessage): void {
    // Handle stream events specially
    if (message.type === 'stream-event') {
      const { requestId, event } = message.payload
      const streamingRequest = this.streamingRequests.get(requestId)
      if (streamingRequest) {
        streamingRequest.events.push(event)
        if (streamingRequest.resolve) {
          streamingRequest.resolve()
        }
      }
      return
    }

    // Handle provider models response
    if (message.type === 'provider-models-response') {
      const { requestId, models, error } = message.payload
      const pendingKey = `models:${requestId}`
      const pending = this.pendingRequests.get(pendingKey)
      if (pending) {
        this.pendingRequests.delete(pendingKey)
        if (error) {
          pending.reject(new Error(error))
        } else {
          pending.resolve(models)
        }
      }
      return
    }

    // Handle tool execute response
    if (message.type === 'tool-execute-response') {
      const { requestId, result, error } = message.payload
      const pendingKey = `tool:${requestId}`
      const pending = this.pendingRequests.get(pendingKey)
      if (pending) {
        this.pendingRequests.delete(pendingKey)
        if (error) {
          pending.reject(new Error(error))
        } else {
          pending.resolve(result)
        }
      }
      return
    }

    // Handle action execute response
    if (message.type === 'action-execute-response') {
      const { requestId, result, error } = message.payload
      const pendingKey = `action:${requestId}`
      const pending = this.pendingRequests.get(pendingKey)
      if (pending) {
        this.pendingRequests.delete(pendingKey)
        if (error) {
          pending.reject(new Error(error))
        } else {
          pending.resolve(result)
        }
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
