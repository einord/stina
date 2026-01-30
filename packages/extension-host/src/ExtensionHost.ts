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
  SchedulerFirePayload,
  ActionResult,
} from '@stina/extension-api'
import { generateMessageId } from '@stina/extension-api'
import { PermissionChecker } from './PermissionChecker.js'
import { validateManifest } from './ManifestValidator.js'

// Import types from dedicated types file
import type {
  ExtensionInfo,
  LoadedExtension,
  ProviderInfo,
  ToolInfo,
  ActionInfo,
  ExtensionHostOptions,
  ExtensionHostEvents,
  PendingRequest,
} from './ExtensionHost.types.js'

// Import handler infrastructure
import { HandlerRegistry, type HandlerContext } from './ExtensionHost.handlers.js'
import { SettingsHandler } from './ExtensionHost.handlers.settings.js'
import { SchedulerHandler } from './ExtensionHost.handlers.scheduler.js'
import { UserHandler } from './ExtensionHost.handlers.user.js'
import { EventsHandler } from './ExtensionHost.handlers.events.js'
import { ChatHandler } from './ExtensionHost.handlers.chat.js'
import { NetworkHandler } from './ExtensionHost.handlers.network.js'

// Re-export types for backward compatibility
export type {
  ExtensionInfo,
  LoadedExtension,
  ProviderInfo,
  ToolInfo,
  ActionInfo,
  ExtensionHostOptions,
  ExtensionHostEvents,
  PendingRequest,
} from './ExtensionHost.types.js'

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
  protected readonly handlerRegistry: HandlerRegistry

  constructor(options: ExtensionHostOptions) {
    super()
    this.options = options
    this.handlerRegistry = this.createHandlerRegistry()
  }

  /**
   * Creates and configures the handler registry.
   * Subclasses can override to add platform-specific handlers.
   */
  protected createHandlerRegistry(): HandlerRegistry {
    const registry = new HandlerRegistry()

    // Register platform-independent handlers
    registry.register(new SettingsHandler())
    registry.register(new SchedulerHandler())
    registry.register(new UserHandler())
    registry.register(new EventsHandler((event) => this.emit('extension-event', event)))
    registry.register(new ChatHandler())

    // Register platform-dependent handlers with callbacks
    registry.register(
      new NetworkHandler({
        fetch: (url, options) => this.handleNetworkFetch(url, options),
        fetchStream: (extensionId, requestId, url, options) =>
          this.handleNetworkFetchStream(extensionId, requestId, url, options),
      })
    )

    return registry
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
      this.options.logger?.debug('Creating PermissionChecker with permissions', {
        extensionId: id,
        permissions: manifest.permissions,
      })

      const extension: LoadedExtension = {
        id,
        manifest,
        status: 'active',
        permissionChecker: new PermissionChecker({
          permissions: manifest.permissions ?? [],
          storageContributions: manifest.contributes?.storage,
        }),
        settings: this.getDefaultSettings(manifest),
        registeredProviders: new Map(),
        registeredTools: new Map(),
        registeredActions: new Map(),
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

    // Unregister all actions
    for (const action of extension.registeredActions.values()) {
      this.emit('action-unregistered', action.id)
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
   * Get tools registered by a specific extension
   * @param extensionId The extension ID to get tools for
   * @returns Array of tools registered by the extension, or empty array if extension not found
   */
  getToolsForExtension(extensionId: string): ToolInfo[] {
    const extension = this.extensions.get(extensionId)
    if (!extension) {
      return []
    }
    return Array.from(extension.registeredTools.values())
  }

  /**
   * Get all registered actions
   */
  getActions(): ActionInfo[] {
    const actions: ActionInfo[] = []
    for (const extension of this.extensions.values()) {
      actions.push(...extension.registeredActions.values())
    }
    return actions
  }

  /**
   * Get a specific action
   */
  getAction(actionId: string): ActionInfo | undefined {
    for (const extension of this.extensions.values()) {
      const action = extension.registeredActions.get(actionId)
      if (action) return action
    }
    return undefined
  }

  /**
   * Notify an extension about a scheduled job firing
   */
  notifySchedulerFire(extensionId: string, payload: SchedulerFirePayload): void {
    if (!this.extensions.has(extensionId)) {
      throw new Error(`Extension "${extensionId}" not found`)
    }

    this.sendToWorker(extensionId, {
      type: 'scheduler-fire',
      id: generateMessageId(),
      payload,
    })
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
   * Execute a tool
   * @param extensionId The extension that provides the tool
   * @param toolId The tool ID
   * @param params Parameters for the tool
   * @param userId Optional user ID for user context
   * @returns Tool execution result
   */
  executeTool(
    extensionId: string,
    toolId: string,
    params: Record<string, unknown>,
    userId?: string
  ): Promise<import('@stina/extension-api').ToolResult> {
    const extension = this.extensions.get(extensionId)
    if (!extension) {
      throw new Error(`Extension "${extensionId}" not found`)
    }

    const tool = extension.registeredTools.get(toolId)
    if (!tool) {
      throw new Error(`Tool "${toolId}" not found in extension "${extensionId}"`)
    }

    return this.sendToolExecuteRequest(extensionId, toolId, params, userId)
  }

  /**
   * Execute an action
   * @param extensionId The extension that provides the action
   * @param actionId The action ID
   * @param params Parameters for the action
   * @param userId Optional user ID for user context
   * @returns Action execution result
   */
  executeAction(
    extensionId: string,
    actionId: string,
    params: Record<string, unknown>,
    userId?: string
  ): Promise<ActionResult> {
    const extension = this.extensions.get(extensionId)
    if (!extension) {
      throw new Error(`Extension "${extensionId}" not found`)
    }

    const action = extension.registeredActions.get(actionId)
    if (!action) {
      throw new Error(`Action "${actionId}" not found in extension "${extensionId}"`)
    }

    return this.sendActionExecuteRequest(extensionId, actionId, params, userId)
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

      case 'action-registered':
        this.handleActionRegistered(extensionId, extension, message.payload)
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

  /**
   * Execute a request using the handler registry
   */
  private async executeRequest(
    extensionId: string,
    extension: LoadedExtension,
    method: RequestMethod,
    payload: unknown
  ): Promise<unknown> {
    const handler = this.handlerRegistry.getHandler(method)
    if (!handler) {
      throw new Error(`Unknown method: ${method}`)
    }

    const context: HandlerContext = {
      extensionId,
      extension,
      options: this.options,
      logger: this.options.logger,
    }

    return handler.handle(context, method, payload)
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

    // Get configSchema and defaultSettings from manifest
    const manifestProviders = extension.manifest.contributes?.providers
    this.options.logger?.debug('handleProviderRegistered: checking manifest', {
      extensionId,
      payloadId: payload.id,
      manifestProvidersCount: manifestProviders?.length ?? 0,
      manifestProviderIds: manifestProviders?.map(p => p.id) ?? [],
    })

    const manifestProvider = manifestProviders?.find(
      (p) => p.id === payload.id
    )

    this.options.logger?.debug('handleProviderRegistered: found manifest provider', {
      extensionId,
      payloadId: payload.id,
      found: !!manifestProvider,
      hasConfigSchema: !!manifestProvider?.configSchema,
      hasDefaultSettings: !!manifestProvider?.defaultSettings,
    })

    const provider: ProviderInfo = {
      id: payload.id,
      name: payload.name,
      extensionId,
      configSchema: manifestProvider?.configSchema,
      defaultSettings: manifestProvider?.defaultSettings,
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

  private handleActionRegistered(
    extensionId: string,
    extension: LoadedExtension,
    payload: { id: string }
  ): void {
    const check = extension.permissionChecker.checkActionRegistration()
    if (!check.allowed) {
      this.emit('log', { extensionId, level: 'error', message: check.reason! })
      return
    }

    const action: ActionInfo = {
      id: payload.id,
      extensionId,
    }

    extension.registeredActions.set(payload.id, action)
    this.emit('action-registered', action)
  }

  private handleStreamEvent(requestId: string, event: StreamEvent): void {
    // This will be connected to the pending request for streaming
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
   * Handle streaming network fetch request (platform-specific).
   * Sends chunks via StreamingFetchChunkMessage to the worker.
   * @param extensionId The extension making the request
   * @param requestId The request ID for correlating chunks
   * @param url The URL to fetch
   * @param options Fetch options
   */
  protected abstract handleNetworkFetchStream(
    extensionId: string,
    requestId: string,
    url: string,
    options?: RequestInit
  ): Promise<void>

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

  /**
   * Send a tool execute request to a worker
   * @param extensionId Extension ID
   * @param toolId Tool ID
   * @param params Parameters for the tool
   * @param userId Optional user ID for user context
   */
  protected abstract sendToolExecuteRequest(
    extensionId: string,
    toolId: string,
    params: Record<string, unknown>,
    userId?: string
  ): Promise<import('@stina/extension-api').ToolResult>

  /**
   * Send an action execute request to a worker
   * @param extensionId Extension ID
   * @param actionId Action ID
   * @param params Parameters for the action
   * @param userId Optional user ID for user context
   */
  protected abstract sendActionExecuteRequest(
    extensionId: string,
    actionId: string,
    params: Record<string, unknown>,
    userId?: string
  ): Promise<ActionResult>
}
