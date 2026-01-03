/**
 * Extension Host
 *
 * Manages the lifecycle of extensions, including loading, activation,
 * message routing, and permission enforcement.
 */

import EventEmitter from 'eventemitter3'
import type {
  ExtensionManifest,
  HostToWorkerMessage,
  WorkerToHostMessage,
  RequestMethod,
  StreamEvent,
  ChatMessage,
  ChatOptions,
  GetModelsOptions,
  ModelInfo,
} from '@stina/extension-api'
import { generateMessageId } from '@stina/extension-api'
import { PermissionChecker } from './PermissionChecker.js'
import { validateManifest } from './ManifestValidator.js'

// ============================================================================
// Types
// ============================================================================

export interface ExtensionInfo {
  id: string
  manifest: ExtensionManifest
  status: 'loading' | 'active' | 'error' | 'disabled'
  error?: string
}

export interface LoadedExtension extends ExtensionInfo {
  status: 'active'
  permissionChecker: PermissionChecker
  settings: Record<string, unknown>
  registeredProviders: Map<string, ProviderInfo>
  registeredTools: Map<string, ToolInfo>
}

export interface ProviderInfo {
  id: string
  name: string
  extensionId: string
}

export interface ToolInfo {
  id: string
  name: string
  description: string
  parameters?: Record<string, unknown>
  extensionId: string
}

export interface ExtensionHostOptions {
  storagePath?: string
  logger?: {
    debug(message: string, context?: Record<string, unknown>): void
    info(message: string, context?: Record<string, unknown>): void
    warn(message: string, context?: Record<string, unknown>): void
    error(message: string, context?: Record<string, unknown>): void
  }
}

export interface ExtensionHostEvents {
  'extension-loaded': (extension: ExtensionInfo) => void
  'extension-error': (extensionId: string, error: Error) => void
  'extension-unloaded': (extensionId: string) => void
  'provider-registered': (provider: ProviderInfo) => void
  'provider-unregistered': (providerId: string) => void
  'tool-registered': (tool: ToolInfo) => void
  'tool-unregistered': (toolId: string) => void
  log: (args: { extensionId: string; level: string; message: string; context?: Record<string, unknown> }) => void
}

export interface PendingRequest<T = unknown> {
  resolve: (value: T) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

// ============================================================================
// Extension Host
// ============================================================================

/**
 * Manages extension lifecycle and message routing
 *
 * Note: This is a platform-neutral implementation.
 * Platform-specific adapters should provide the Worker implementation:
 * - Browser: Use Web Workers
 * - Node.js: Use Worker Threads
 */
export abstract class ExtensionHost extends EventEmitter<ExtensionHostEvents> {
  protected readonly options: ExtensionHostOptions
  protected readonly extensions = new Map<string, LoadedExtension>()
  protected readonly pendingRequests = new Map<string, PendingRequest>()

  constructor(options: ExtensionHostOptions) {
    super()
    this.options = options
  }

  /**
   * Load and activate an extension
   */
  async loadExtension(manifest: ExtensionManifest, extensionPath: string): Promise<ExtensionInfo> {
    const { id } = manifest

    // Validate manifest
    const validation = validateManifest(manifest)
    if (!validation.valid) {
      const error = new Error(`Invalid manifest: ${validation.errors.join(', ')}`)
      this.emit('extension-error', id, error)
      return {
        id,
        manifest,
        status: 'error',
        error: error.message,
      }
    }

    // Log warnings
    for (const warning of validation.warnings) {
      this.emit('log', { extensionId: id, level: 'warn', message: warning })
    }

    try {
      // Create the extension entry
      // Debug: log the permissions being loaded
      this.options.logger?.debug('Creating PermissionChecker with permissions', {
        extensionId: id,
        permissions: manifest.permissions,
      })

      const extension: LoadedExtension = {
        id,
        manifest,
        status: 'active',
        permissionChecker: new PermissionChecker(manifest.permissions),
        settings: this.getDefaultSettings(manifest),
        registeredProviders: new Map(),
        registeredTools: new Map(),
      }

      this.extensions.set(id, extension)

      // Start the worker (implemented by platform-specific subclass)
      await this.startWorker(id, extensionPath, manifest)

      this.emit('extension-loaded', extension)
      return extension
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.emit('extension-error', id, err)
      return {
        id,
        manifest,
        status: 'error',
        error: err.message,
      }
    }
  }

  /**
   * Unload an extension
   */
  async unloadExtension(extensionId: string): Promise<void> {
    const extension = this.extensions.get(extensionId)
    if (!extension) return

    // Unregister all providers
    for (const provider of extension.registeredProviders.values()) {
      this.emit('provider-unregistered', provider.id)
    }

    // Unregister all tools
    for (const tool of extension.registeredTools.values()) {
      this.emit('tool-unregistered', tool.id)
    }

    // Stop the worker
    await this.stopWorker(extensionId)

    this.extensions.delete(extensionId)
    this.emit('extension-unloaded', extensionId)
  }

  /**
   * Get all loaded extensions
   */
  getExtensions(): ExtensionInfo[] {
    return Array.from(this.extensions.values())
  }

  /**
   * Get a specific extension
   */
  getExtension(extensionId: string): LoadedExtension | undefined {
    return this.extensions.get(extensionId)
  }

  /**
   * Get all registered providers
   */
  getProviders(): ProviderInfo[] {
    const providers: ProviderInfo[] = []
    for (const extension of this.extensions.values()) {
      providers.push(...extension.registeredProviders.values())
    }
    return providers
  }

  /**
   * Get a specific provider
   */
  getProvider(providerId: string): ProviderInfo | undefined {
    for (const extension of this.extensions.values()) {
      const provider = extension.registeredProviders.get(providerId)
      if (provider) return provider
    }
    return undefined
  }

  /**
   * Get all registered tools
   */
  getTools(): ToolInfo[] {
    const tools: ToolInfo[] = []
    for (const extension of this.extensions.values()) {
      tools.push(...extension.registeredTools.values())
    }
    return tools
  }

  /**
   * Request a chat completion from a provider
   */
  chat(
    providerId: string,
    messages: ChatMessage[],
    options: ChatOptions
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const provider = this.getProvider(providerId)
    if (!provider) {
      throw new Error(`Provider "${providerId}" not found`)
    }

    return this.sendProviderChatRequest(provider.extensionId, providerId, messages, options)
  }

  /**
   * Get models from a provider
   * @param providerId The provider ID
   * @param options Optional settings for the provider (e.g., URL)
   */
  async getModels(providerId: string, options?: GetModelsOptions): Promise<ModelInfo[]> {
    const provider = this.getProvider(providerId)
    if (!provider) {
      throw new Error(`Provider "${providerId}" not found`)
    }

    return this.sendProviderModelsRequest(provider.extensionId, providerId, options)
  }

  /**
   * Update extension settings
   */
  async updateSettings(extensionId: string, key: string, value: unknown): Promise<void> {
    const extension = this.extensions.get(extensionId)
    if (!extension) {
      throw new Error(`Extension "${extensionId}" not found`)
    }

    extension.settings[key] = value

    // Notify the extension
    this.sendToWorker(extensionId, {
      type: 'settings-changed',
      id: generateMessageId(),
      payload: { key, value },
    })
  }

  // ============================================================================
  // Message Handling (from worker)
  // ============================================================================

  /**
   * Handle a message from an extension worker
   */
  protected handleWorkerMessage(extensionId: string, message: WorkerToHostMessage): void {
    const extension = this.extensions.get(extensionId)
    if (!extension) return

    switch (message.type) {
      case 'ready':
        // Worker is ready, send activation message
        this.sendActivateMessage(extensionId, extension)
        break

      case 'request':
        this.handleRequest(extensionId, extension, message.id, message.method, message.payload)
        break

      case 'provider-registered':
        this.handleProviderRegistered(extensionId, extension, message.payload)
        break

      case 'tool-registered':
        this.handleToolRegistered(extensionId, extension, message.payload)
        break

      case 'log':
        this.emit('log', {
          extensionId,
          level: message.payload.level,
          message: message.payload.message,
          context: message.payload.data,
        })
        break

      case 'stream-event':
        this.handleStreamEvent(message.payload.requestId, message.payload.event)
        break
    }
  }

  private sendActivateMessage(extensionId: string, extension: LoadedExtension): void {
    this.sendToWorker(extensionId, {
      type: 'activate',
      id: generateMessageId(),
      payload: {
        extensionId,
        extensionVersion: extension.manifest.version,
        storagePath: `${this.options.storagePath}/${extensionId}`,
        permissions: extension.manifest.permissions,
        settings: extension.settings,
      },
    })
  }

  private async handleRequest(
    extensionId: string,
    extension: LoadedExtension,
    requestId: string,
    method: RequestMethod,
    payload: unknown
  ): Promise<void> {
    try {
      const result = await this.executeRequest(extensionId, extension, method, payload)
      this.sendResponse(extensionId, requestId, true, result)
    } catch (error) {
      this.sendResponse(extensionId, requestId, false, undefined, error instanceof Error ? error.message : String(error))
    }
  }

  private async executeRequest(
    extensionId: string,
    extension: LoadedExtension,
    method: RequestMethod,
    payload: unknown
  ): Promise<unknown> {
    // Type-safe payload access using bracket notation
    const p = payload as { [key: string]: unknown }

    switch (method) {
      case 'network.fetch': {
        const url = p['url'] as string
        const options = p['options'] as RequestInit | undefined
        // Debug: log permissions before checking
        this.options.logger?.debug('Network fetch request', {
          extensionId,
          url,
          permissions: extension.permissionChecker.getPermissions(),
        })
        const check = extension.permissionChecker.checkNetworkAccess(url)
        if (!check.allowed) {
          this.options.logger?.error('Network access denied', {
            extensionId,
            url,
            reason: check.reason,
            permissions: extension.permissionChecker.getPermissions(),
          })
          throw new Error(check.reason)
        }
        return this.handleNetworkFetch(url, options)
      }

      case 'settings.getAll':
        return extension.settings

      case 'settings.get': {
        const key = p['key'] as string
        return extension.settings[key]
      }

      case 'settings.set': {
        const check = extension.permissionChecker.checkSettingsAccess()
        if (!check.allowed) {
          throw new Error(check.reason)
        }
        const key = p['key'] as string
        const value = p['value']
        extension.settings[key] = value
        return undefined
      }

      case 'database.execute': {
        const dbCheck = extension.permissionChecker.checkDatabaseAccess()
        if (!dbCheck.allowed) {
          throw new Error(dbCheck.reason)
        }
        const sql = p['sql'] as string
        const params = p['params'] as unknown[] | undefined
        const sqlCheck = extension.permissionChecker.validateSQL(extensionId, sql)
        if (!sqlCheck.allowed) {
          throw new Error(sqlCheck.reason)
        }
        return this.handleDatabaseExecute(extensionId, sql, params)
      }

      case 'storage.get': {
        const check = extension.permissionChecker.checkStorageAccess()
        if (!check.allowed) {
          throw new Error(check.reason)
        }
        const key = p['key'] as string
        return this.handleStorageGet(extensionId, key)
      }

      case 'storage.set': {
        const check = extension.permissionChecker.checkStorageAccess()
        if (!check.allowed) {
          throw new Error(check.reason)
        }
        const key = p['key'] as string
        const value = p['value']
        return this.handleStorageSet(extensionId, key, value)
      }

      case 'storage.delete': {
        const check = extension.permissionChecker.checkStorageAccess()
        if (!check.allowed) {
          throw new Error(check.reason)
        }
        const key = p['key'] as string
        return this.handleStorageDelete(extensionId, key)
      }

      case 'storage.keys': {
        const check = extension.permissionChecker.checkStorageAccess()
        if (!check.allowed) {
          throw new Error(check.reason)
        }
        return this.handleStorageKeys(extensionId)
      }

      default:
        throw new Error(`Unknown method: ${method}`)
    }
  }

  private sendResponse(extensionId: string, requestId: string, success: boolean, data?: unknown, error?: string): void {
    this.sendToWorker(extensionId, {
      type: 'response',
      id: generateMessageId(),
      payload: { requestId, success, data, error },
    })
  }

  private handleProviderRegistered(
    extensionId: string,
    extension: LoadedExtension,
    payload: { id: string; name: string }
  ): void {
    const check = extension.permissionChecker.checkProviderRegistration()
    if (!check.allowed) {
      this.emit('log', { extensionId, level: 'error', message: check.reason! })
      return
    }

    const provider: ProviderInfo = {
      id: payload.id,
      name: payload.name,
      extensionId,
    }

    extension.registeredProviders.set(payload.id, provider)
    this.emit('provider-registered', provider)
  }

  private handleToolRegistered(
    extensionId: string,
    extension: LoadedExtension,
    payload: { id: string; name: string; description: string; parameters?: Record<string, unknown> }
  ): void {
    const check = extension.permissionChecker.checkToolRegistration()
    if (!check.allowed) {
      this.emit('log', { extensionId, level: 'error', message: check.reason! })
      return
    }

    const tool: ToolInfo = {
      id: payload.id,
      name: payload.name,
      description: payload.description,
      parameters: payload.parameters,
      extensionId,
    }

    extension.registeredTools.set(payload.id, tool)
    this.emit('tool-registered', tool)
  }

  private handleStreamEvent(requestId: string, event: StreamEvent): void {
    // This will be connected to the pending request for streaming
    // Implementation depends on how we handle async generators across message boundaries
    const pending = this.pendingRequests.get(requestId)
    if (pending && 'onEvent' in pending) {
      (pending as unknown as { onEvent: (event: StreamEvent) => void }).onEvent(event)
    }
  }

  // ============================================================================
  // Default Settings
  // ============================================================================

  private getDefaultSettings(manifest: ExtensionManifest): Record<string, unknown> {
    const settings: Record<string, unknown> = {}

    if (manifest.contributes?.settings) {
      for (const setting of manifest.contributes.settings) {
        if (setting.default !== undefined) {
          settings[setting.id] = setting.default
        }
      }
    }

    return settings
  }

  // ============================================================================
  // Abstract Methods (platform-specific implementation)
  // ============================================================================

  /**
   * Start a worker for an extension
   */
  protected abstract startWorker(
    extensionId: string,
    extensionPath: string,
    manifest: ExtensionManifest
  ): Promise<void>

  /**
   * Stop a worker for an extension
   */
  protected abstract stopWorker(extensionId: string): Promise<void>

  /**
   * Send a message to a worker
   */
  protected abstract sendToWorker(extensionId: string, message: HostToWorkerMessage): void

  /**
   * Handle network fetch request (platform-specific)
   */
  protected abstract handleNetworkFetch(
    url: string,
    options?: RequestInit
  ): Promise<{ status: number; statusText: string; headers: Record<string, string>; body: string }>

  /**
   * Handle database execute request (platform-specific)
   */
  protected abstract handleDatabaseExecute(
    extensionId: string,
    sql: string,
    params?: unknown[]
  ): Promise<unknown[]>

  /**
   * Handle storage get request (platform-specific)
   */
  protected abstract handleStorageGet(extensionId: string, key: string): Promise<unknown>

  /**
   * Handle storage set request (platform-specific)
   */
  protected abstract handleStorageSet(extensionId: string, key: string, value: unknown): Promise<void>

  /**
   * Handle storage delete request (platform-specific)
   */
  protected abstract handleStorageDelete(extensionId: string, key: string): Promise<void>

  /**
   * Handle storage keys request (platform-specific)
   */
  protected abstract handleStorageKeys(extensionId: string): Promise<string[]>

  /**
   * Send a provider chat request to a worker
   */
  protected abstract sendProviderChatRequest(
    extensionId: string,
    providerId: string,
    messages: ChatMessage[],
    options: ChatOptions
  ): AsyncGenerator<StreamEvent, void, unknown>

  /**
   * Send a provider models request to a worker
   */
  protected abstract sendProviderModelsRequest(
    extensionId: string,
    providerId: string,
    options?: GetModelsOptions
  ): Promise<ModelInfo[]>
}
