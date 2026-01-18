/// <reference lib="dom" />

/**
 * Web Extension Host
 *
 * Platform-specific implementation using Web Workers.
 * Used in: Web app, Electron renderer process.
 */

import type {
  ExtensionManifest,
  HostToWorkerMessage,
  WorkerToHostMessage,
  StreamEvent,
  ChatMessage,
  ChatOptions,
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

export interface WebExtensionHostOptions extends ExtensionHostOptions {
  /**
   * Base URL for loading extensions.
   * Extensions will be loaded from: {baseUrl}/{extensionId}/index.js
   */
  extensionsBaseUrl?: string
}

// ============================================================================
// Web Extension Host
// ============================================================================

/**
 * Browser-specific extension host using Web Workers
 */
export class WebExtensionHost extends ExtensionHost {
  private readonly workers = new Map<string, WorkerInfo>()
  private readonly streamingRequests = new Map<string, StreamingRequest>()
  private readonly extensionStorage = new Map<string, Map<string, unknown>>()
  private readonly webOptions: WebExtensionHostOptions

  constructor(options: WebExtensionHostOptions = {}) {
    super(options)
    this.webOptions = options
  }

  /**
   * Load an extension from a URL
   * @param manifest The extension manifest
   * @param extensionUrl URL to the extension's main JS file
   */
  async loadExtensionFromUrl(manifest: ExtensionManifest, extensionUrl: string): Promise<void> {
    await this.loadExtension(manifest, extensionUrl)
  }

  /**
   * Load an extension by ID using the configured base URL
   */
  async loadExtensionById(extensionId: string): Promise<void> {
    const baseUrl = this.webOptions.extensionsBaseUrl || '/extensions'
    const manifestUrl = `${baseUrl}/${extensionId}/manifest.json`

    // Fetch manifest
    const response = await fetch(manifestUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch manifest: ${response.status} ${response.statusText}`)
    }

    const manifest = (await response.json()) as ExtensionManifest
    const extensionUrl = `${baseUrl}/${extensionId}/${manifest.main}`

    await this.loadExtension(manifest, extensionUrl)
  }

  // ============================================================================
  // Abstract Method Implementations
  // ============================================================================

  protected async startWorker(
    extensionId: string,
    extensionUrl: string,
    _manifest: ExtensionManifest
  ): Promise<void> {
    // Create a blob URL with code that imports the extension
    // The extension should bundle its own runtime and call initializeExtension()
    const workerCode = `
      // Import the extension module - it should initialize itself
      import('${extensionUrl}').catch(err => {
        console.error('Failed to load extension:', err);
        self.postMessage({ type: 'error', payload: { message: err.message } });
      });
    `

    const blob = new Blob([workerCode], { type: 'application/javascript' })
    const blobUrl = URL.createObjectURL(blob)

    const worker = new Worker(blobUrl, { type: 'module' })

    // Clean up blob URL after worker starts
    URL.revokeObjectURL(blobUrl)

    const workerInfo: WorkerInfo = {
      worker,
      ready: false,
    }

    // Set up message handling
    worker.onmessage = (event: MessageEvent<WorkerToHostMessage>) => {
      const message = event.data
      this.handleWorkerMessage(extensionId, message)

      // Handle ready state
      if (message.type === 'ready') {
        workerInfo.ready = true
        if (workerInfo.pendingActivation) {
          workerInfo.pendingActivation.resolve()
          workerInfo.pendingActivation = undefined
        }
      }
    }

    worker.onerror = (error) => {
      const err = new Error(error.message || 'Worker error')
      this.emit('extension-error', extensionId, err)
      if (workerInfo.pendingActivation) {
        workerInfo.pendingActivation.reject(err)
        workerInfo.pendingActivation = undefined
      }
    }

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
      setTimeout(() => {
        workerInfo.worker.terminate()
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
    _extensionId: string,
    _sql: string,
    _params?: unknown[]
  ): Promise<unknown[]> {
    // Database access not available in browser context
    // Extensions should use storage API or communicate with backend
    throw new Error('Database access not available in browser. Use storage API instead.')
  }

  protected async handleStorageGet(extensionId: string, key: string): Promise<unknown> {
    // Try to use localStorage with extension prefix
    const storageKey = `stina-ext:${extensionId}:${key}`
    const value = localStorage.getItem(storageKey)
    return value ? JSON.parse(value) : undefined
  }

  protected async handleStorageSet(extensionId: string, key: string, value: unknown): Promise<void> {
    const storageKey = `stina-ext:${extensionId}:${key}`
    localStorage.setItem(storageKey, JSON.stringify(value))
  }

  protected async handleStorageDelete(extensionId: string, key: string): Promise<void> {
    const storageKey = `stina-ext:${extensionId}:${key}`
    localStorage.removeItem(storageKey)
  }

  protected async handleStorageKeys(extensionId: string): Promise<string[]> {
    const prefix = `stina-ext:${extensionId}:`
    const keys: string[] = []

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(prefix)) {
        keys.push(key.slice(prefix.length))
      }
    }

    return keys
  }

  // User-scoped storage methods
  protected async handleStorageGetForUser(extensionId: string, userId: string, key: string): Promise<unknown> {
    const storageKey = `stina-ext:${extensionId}:user:${userId}:${key}`
    const value = localStorage.getItem(storageKey)
    return value ? JSON.parse(value) : undefined
  }

  protected async handleStorageSetForUser(extensionId: string, userId: string, key: string, value: unknown): Promise<void> {
    const storageKey = `stina-ext:${extensionId}:user:${userId}:${key}`
    localStorage.setItem(storageKey, JSON.stringify(value))
  }

  protected async handleStorageDeleteForUser(extensionId: string, userId: string, key: string): Promise<void> {
    const storageKey = `stina-ext:${extensionId}:user:${userId}:${key}`
    localStorage.removeItem(storageKey)
  }

  protected async handleStorageKeysForUser(extensionId: string, userId: string): Promise<string[]> {
    const prefix = `stina-ext:${extensionId}:user:${userId}:`
    const keys: string[] = []

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(prefix)) {
        keys.push(key.slice(prefix.length))
      }
    }

    return keys
  }

  protected async sendToolExecuteRequest(
    extensionId: string,
    toolId: string,
    params: Record<string, unknown>,
    userId?: string
  ): Promise<ToolResult> {
    const requestId = generateMessageId()

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Tool execution timeout'))
      }, 60000)

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

      this.sendToWorker(extensionId, {
        type: 'tool-execute-request',
        id: requestId,
        payload: { toolId, params, userId },
      })
    })
  }

  protected async sendActionExecuteRequest(
    extensionId: string,
    actionId: string,
    params: Record<string, unknown>,
    userId?: string
  ): Promise<ActionResult> {
    const requestId = generateMessageId()

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(`action:${requestId}`)
        reject(new Error('Action execution timeout'))
      }, 30000)

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

      this.sendToWorker(extensionId, {
        type: 'action-execute-request',
        id: requestId,
        payload: { actionId, params, userId },
      })
    })
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
    providerId: string
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
        payload: { providerId },
      })
    })
  }

  // Override to handle stream events and tool responses
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
