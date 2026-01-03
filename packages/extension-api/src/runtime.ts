/**
 * Extension Runtime - Runs inside the worker
 *
 * This module handles communication with the Extension Host and provides
 * the ExtensionContext to the extension's activate function.
 */

import type {
  ExtensionContext,
  ExtensionModule,
  Disposable,
  NetworkAPI,
  SettingsAPI,
  ProvidersAPI,
  ToolsAPI,
  DatabaseAPI,
  StorageAPI,
  LogAPI,
  AIProvider,
  Tool,
  ToolResult,
  ModelInfo,
  ChatMessage,
  ChatOptions,
  GetModelsOptions,
  StreamEvent,
} from './types.js'

import type {
  HostToWorkerMessage,
  WorkerToHostMessage,
  RequestMessage,
  PendingRequest,
} from './messages.js'

import { generateMessageId } from './messages.js'

// ============================================================================
// Environment Detection and Message Port
// ============================================================================

/**
 * Detect if we're in Node.js Worker Thread or Web Worker
 * and get the appropriate message port
 */
interface MessagePort {
  postMessage(message: WorkerToHostMessage): void
  onMessage(handler: (message: HostToWorkerMessage) => void): void
}

function getMessagePort(): MessagePort {
  // Check if we're in Node.js Worker Thread
  if (typeof process !== 'undefined' && process.versions?.node) {
    // Node.js Worker Thread - import parentPort dynamically
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parentPort } = require('node:worker_threads')
    return {
      postMessage: (message) => parentPort?.postMessage(message),
      onMessage: (handler) => parentPort?.on('message', handler),
    }
  }

  // Web Worker - use self
  return {
    postMessage: (message) => self.postMessage(message),
    onMessage: (handler) => {
      self.addEventListener('message', (event: MessageEvent<HostToWorkerMessage>) => {
        handler(event.data)
      })
    },
  }
}

const messagePort = getMessagePort()

// ============================================================================
// Global State
// ============================================================================

let extensionModule: ExtensionModule | null = null
let extensionDisposable: Disposable | null = null
let extensionContext: ExtensionContext | null = null

const pendingRequests = new Map<string, PendingRequest>()
const registeredProviders = new Map<string, AIProvider>()
const registeredTools = new Map<string, Tool>()
const settingsCallbacks: Array<(key: string, value: unknown) => void> = []

const REQUEST_TIMEOUT = 30000 // 30 seconds

// ============================================================================
// Message Handling
// ============================================================================

/**
 * Send a message to the host
 */
function postMessage(message: WorkerToHostMessage): void {
  messagePort.postMessage(message)
}

/**
 * Send a request to the host and wait for response
 */
async function sendRequest<T>(method: RequestMessage['method'], payload: unknown): Promise<T> {
  const id = generateMessageId()

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(id)
      reject(new Error(`Request ${method} timed out`))
    }, REQUEST_TIMEOUT)

    pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject, timeout })

    postMessage({
      type: 'request',
      id,
      method,
      payload,
    })
  })
}

/**
 * Handle messages from the host
 */
async function handleHostMessage(message: HostToWorkerMessage): Promise<void> {
  switch (message.type) {
    case 'activate':
      await handleActivate(message.payload)
      break

    case 'deactivate':
      await handleDeactivate()
      break

    case 'settings-changed':
      handleSettingsChanged(message.payload.key, message.payload.value)
      break

    case 'provider-chat-request':
      await handleProviderChatRequest(message.id, message.payload)
      break

    case 'provider-models-request':
      await handleProviderModelsRequest(message.id, message.payload)
      break

    case 'tool-execute-request':
      await handleToolExecuteRequest(message.id, message.payload)
      break

    case 'response':
      handleResponse(message.payload)
      break
  }
}

function handleResponse(payload: { requestId: string; success: boolean; data?: unknown; error?: string }): void {
  const pending = pendingRequests.get(payload.requestId)
  if (!pending) return

  clearTimeout(pending.timeout)
  pendingRequests.delete(payload.requestId)

  if (payload.success) {
    pending.resolve(payload.data)
  } else {
    pending.reject(new Error(payload.error || 'Unknown error'))
  }
}

// ============================================================================
// Activation / Deactivation
// ============================================================================

async function handleActivate(payload: {
  extensionId: string
  extensionVersion: string
  storagePath: string
  permissions: string[]
  settings: Record<string, unknown>
}): Promise<void> {
  const { extensionId, extensionVersion, storagePath, permissions } = payload

  // Build the context based on permissions
  extensionContext = buildContext(extensionId, extensionVersion, storagePath, permissions)

  // Import and activate the extension
  try {
    // The actual extension code should be bundled and available
    // This is called after the extension code has been loaded into the worker
    if (extensionModule?.activate) {
      const result = await extensionModule.activate(extensionContext)
      if (result && 'dispose' in result) {
        extensionDisposable = result
      }
    }
  } catch (error) {
    extensionContext.log.error('Failed to activate extension', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

async function handleDeactivate(): Promise<void> {
  try {
    if (extensionModule?.deactivate) {
      await extensionModule.deactivate()
    }
    if (extensionDisposable) {
      extensionDisposable.dispose()
    }
  } catch (error) {
    console.error('Error during deactivation:', error)
  } finally {
    extensionModule = null
    extensionDisposable = null
    extensionContext = null
    registeredProviders.clear()
    registeredTools.clear()
    settingsCallbacks.length = 0
  }
}

function handleSettingsChanged(key: string, value: unknown): void {
  for (const callback of settingsCallbacks) {
    try {
      callback(key, value)
    } catch (error) {
      console.error('Error in settings change callback:', error)
    }
  }
}

// ============================================================================
// Provider / Tool Requests
// ============================================================================

async function handleProviderChatRequest(
  requestId: string,
  payload: { providerId: string; messages: ChatMessage[]; options: ChatOptions }
): Promise<void> {
  const provider = registeredProviders.get(payload.providerId)
  if (!provider) {
    postMessage({
      type: 'request',
      id: generateMessageId(),
      method: 'network.fetch', // Dummy, we need a proper error response
      payload: { error: `Provider ${payload.providerId} not found` },
    })
    return
  }

  try {
    const generator = provider.chat(payload.messages, payload.options)

    for await (const event of generator) {
      postMessage({
        type: 'stream-event',
        payload: { requestId, event },
      })
    }
  } catch (error) {
    postMessage({
      type: 'stream-event',
      payload: {
        requestId,
        event: {
          type: 'error',
          message: error instanceof Error ? error.message : String(error),
        },
      },
    })
  }
}

async function handleProviderModelsRequest(
  requestId: string,
  payload: { providerId: string; options?: GetModelsOptions }
): Promise<void> {
  const provider = registeredProviders.get(payload.providerId)
  if (!provider) {
    // Send error response
    postMessage({
      type: 'provider-models-response',
      payload: {
        requestId,
        models: [],
        error: `Provider ${payload.providerId} not found`,
      },
    })
    return
  }

  try {
    // Pass options to getModels so provider can use settings (e.g., URL for Ollama)
    const models = await provider.getModels(payload.options)
    // Send response with models
    postMessage({
      type: 'provider-models-response',
      payload: {
        requestId,
        models,
      },
    })
  } catch (error) {
    postMessage({
      type: 'provider-models-response',
      payload: {
        requestId,
        models: [],
        error: error instanceof Error ? error.message : String(error),
      },
    })
  }
}

async function handleToolExecuteRequest(
  requestId: string,
  payload: { toolId: string; params: Record<string, unknown> }
): Promise<void> {
  const tool = registeredTools.get(payload.toolId)
  if (!tool) {
    // Send error response
    return
  }

  try {
    const result = await tool.execute(payload.params)
    // Send response with result
    postMessage({
      type: 'request',
      id: requestId,
      method: 'settings.get', // Dummy method, need proper response type
      payload: result,
    })
  } catch (error) {
    console.error('Error executing tool:', error)
  }
}

// ============================================================================
// Context Building
// ============================================================================

function buildContext(
  extensionId: string,
  extensionVersion: string,
  storagePath: string,
  permissions: string[]
): ExtensionContext {
  const hasPermission = (perm: string): boolean => {
    return permissions.some((p) => {
      if (p === perm) return true
      if (p.endsWith(':*') && perm.startsWith(p.slice(0, -1))) return true
      return false
    })
  }

  const log: LogAPI = {
    debug: (message, data) => postMessage({ type: 'log', payload: { level: 'debug', message, data } }),
    info: (message, data) => postMessage({ type: 'log', payload: { level: 'info', message, data } }),
    warn: (message, data) => postMessage({ type: 'log', payload: { level: 'warn', message, data } }),
    error: (message, data) => postMessage({ type: 'log', payload: { level: 'error', message, data } }),
  }

  const context: ExtensionContext = {
    extension: {
      id: extensionId,
      version: extensionVersion,
      storagePath,
    },
    log,
  }

  // Add network API if permitted
  if (permissions.some((p) => p.startsWith('network:'))) {
    const networkApi: NetworkAPI = {
      async fetch(url: string, options?: RequestInit): Promise<Response> {
        const result = await sendRequest<{ status: number; statusText: string; headers: Record<string, string>; body: string }>('network.fetch', { url, options })
        return new Response(result.body, {
          status: result.status,
          statusText: result.statusText,
          headers: result.headers,
        })
      },
    }
    ;(context as { network: NetworkAPI }).network = networkApi
  }

  // Add settings API if permitted
  if (hasPermission('settings.register')) {
    const settingsApi: SettingsAPI = {
      async getAll<T extends Record<string, unknown>>(): Promise<T> {
        return sendRequest<T>('settings.getAll', {})
      },
      async get<T>(key: string): Promise<T | undefined> {
        return sendRequest<T | undefined>('settings.get', { key })
      },
      async set(key: string, value: unknown): Promise<void> {
        return sendRequest<void>('settings.set', { key, value })
      },
      onChange(callback: (key: string, value: unknown) => void): Disposable {
        settingsCallbacks.push(callback)
        return {
          dispose: () => {
            const index = settingsCallbacks.indexOf(callback)
            if (index >= 0) settingsCallbacks.splice(index, 1)
          },
        }
      },
    }
    ;(context as { settings: SettingsAPI }).settings = settingsApi
  }

  // Add providers API if permitted
  if (hasPermission('provider.register')) {
    const providersApi: ProvidersAPI = {
      register(provider: AIProvider): Disposable {
        registeredProviders.set(provider.id, provider)
        postMessage({
          type: 'provider-registered',
          payload: { id: provider.id, name: provider.name },
        })
        return {
          dispose: () => {
            registeredProviders.delete(provider.id)
          },
        }
      },
    }
    ;(context as { providers: ProvidersAPI }).providers = providersApi
  }

  // Add tools API if permitted
  if (hasPermission('tools.register')) {
    const toolsApi: ToolsAPI = {
      register(tool: Tool): Disposable {
        registeredTools.set(tool.id, tool)
        postMessage({
          type: 'tool-registered',
          payload: {
            id: tool.id,
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        })
        return {
          dispose: () => {
            registeredTools.delete(tool.id)
          },
        }
      },
    }
    ;(context as { tools: ToolsAPI }).tools = toolsApi
  }

  // Add database API if permitted
  if (hasPermission('database.own')) {
    const databaseApi: DatabaseAPI = {
      async execute<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
        return sendRequest<T[]>('database.execute', { sql, params })
      },
    }
    ;(context as { database: DatabaseAPI }).database = databaseApi
  }

  // Add storage API if permitted
  if (hasPermission('storage.local')) {
    const storageApi: StorageAPI = {
      async get<T>(key: string): Promise<T | undefined> {
        return sendRequest<T | undefined>('storage.get', { key })
      },
      async set(key: string, value: unknown): Promise<void> {
        return sendRequest<void>('storage.set', { key, value })
      },
      async delete(key: string): Promise<void> {
        return sendRequest<void>('storage.delete', { key })
      },
      async keys(): Promise<string[]> {
        return sendRequest<string[]>('storage.keys', {})
      },
    }
    ;(context as { storage: StorageAPI }).storage = storageApi
  }

  return context
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the extension runtime
 * This should be called by the extension's entry point
 */
export function initializeExtension(module: ExtensionModule): void {
  extensionModule = module

  // Set up message listener using the appropriate message port
  messagePort.onMessage(async (message: HostToWorkerMessage) => {
    try {
      await handleHostMessage(message)
    } catch (error) {
      console.error('Error handling message:', error)
    }
  })

  // Signal that we're ready
  postMessage({ type: 'ready' })
}

// Re-export types for extensions to use
export type {
  ExtensionContext,
  ExtensionModule,
  Disposable,
  AIProvider,
  Tool,
  ToolResult,
  ModelInfo,
  ChatMessage,
  ChatOptions,
  GetModelsOptions,
  StreamEvent,
} from './types.js'
