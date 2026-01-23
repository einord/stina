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
  ProviderConfigSchema,
  SchedulerJobRequest,
  LocalizedString,
  SchedulerFirePayload,
  ChatInstructionMessage,
  UserProfile,
  ActionResult,
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
  registeredActions: Map<string, ActionInfo>
}

export interface ProviderInfo {
  id: string
  name: string
  extensionId: string
  /** Schema for provider-specific configuration UI */
  configSchema?: ProviderConfigSchema
  /** Default settings for this provider */
  defaultSettings?: Record<string, unknown>
}

export interface ToolInfo {
  id: string
  /** Display name - can be a simple string or localized strings */
  name: LocalizedString
  /** Description - can be a simple string or localized strings */
  description: LocalizedString
  parameters?: Record<string, unknown>
  extensionId: string
}

export interface ActionInfo {
  id: string
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
  scheduler?: {
    schedule: (extensionId: string, job: SchedulerJobRequest) => Promise<void>
    cancel: (extensionId: string, jobId: string) => Promise<void>
  }
  chat?: {
    appendInstruction: (extensionId: string, message: ChatInstructionMessage) => Promise<void>
  }
  user?: {
    getProfile: (extensionId: string) => Promise<UserProfile>
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
  'action-registered': (action: ActionInfo) => void
  'action-unregistered': (actionId: string) => void
  'extension-event': (event: {
    extensionId: string
    name: string
    payload?: Record<string, unknown>
  }) => void
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

      case 'network.fetch-stream': {
        const url = p['url'] as string
        const options = p['options'] as RequestInit | undefined
        const requestId = p['requestId'] as string
        this.options.logger?.debug('Network fetch-stream request', {
          extensionId,
          url,
          requestId,
        })
        const check = extension.permissionChecker.checkNetworkAccess(url)
        if (!check.allowed) {
          this.options.logger?.error('Network access denied', {
            extensionId,
            url,
            reason: check.reason,
          })
          throw new Error(check.reason)
        }
        // Start streaming in background, return immediately
        this.handleNetworkFetchStream(extensionId, requestId, url, options)
        return { status: 'streaming' }
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

      case 'user.getProfile': {
        const check = extension.permissionChecker.checkUserProfileRead()
        if (!check.allowed) {
          throw new Error(check.reason)
        }
        if (!this.options.user) {
          throw new Error('User profile not available')
        }
        return this.options.user.getProfile(extensionId)
      }

      case 'events.emit': {
        const check = extension.permissionChecker.checkEventsEmit()
        if (!check.allowed) {
          throw new Error(check.reason)
        }
        const name = p['name']
        if (!name || typeof name !== 'string') {
          throw new Error('Event name is required')
        }
        const payload = p['payload']
        if (payload !== undefined && (typeof payload !== 'object' || Array.isArray(payload))) {
          throw new Error('Event payload must be an object')
        }
        this.emit('extension-event', {
          extensionId,
          name,
          payload: payload as Record<string, unknown> | undefined,
        })
        return undefined
      }

      case 'scheduler.schedule': {
        const check = extension.permissionChecker.checkSchedulerAccess()
        if (!check.allowed) {
          throw new Error(check.reason)
        }
        if (!this.options.scheduler) {
          throw new Error('Scheduler not configured')
        }
        const job = p['job']
        if (!job || typeof job !== 'object') {
          throw new Error('Job payload is required')
        }
        await this.options.scheduler.schedule(extensionId, job as SchedulerJobRequest)
        return undefined
      }

      case 'scheduler.cancel': {
        const check = extension.permissionChecker.checkSchedulerAccess()
        if (!check.allowed) {
          throw new Error(check.reason)
        }
        if (!this.options.scheduler) {
          throw new Error('Scheduler not configured')
        }
        const jobId = p['jobId']
        if (!jobId || typeof jobId !== 'string') {
          throw new Error('jobId is required')
        }
        await this.options.scheduler.cancel(extensionId, jobId)
        return undefined
      }

      case 'chat.appendInstruction': {
        const check = extension.permissionChecker.checkChatMessageWrite()
        if (!check.allowed) {
          throw new Error(check.reason)
        }
        if (!this.options.chat) {
          throw new Error('Chat bridge not configured')
        }
        const text = p['text']
        const conversationId = p['conversationId']
        const userId = p['userId']
        if (!text || typeof text !== 'string') {
          throw new Error('text is required')
        }
        if (conversationId !== undefined && typeof conversationId !== 'string') {
          throw new Error('conversationId must be a string')
        }
        if (userId !== undefined && typeof userId !== 'string') {
          throw new Error('userId must be a string')
        }
        await this.options.chat.appendInstruction(extensionId, {
          text,
          conversationId: conversationId as string | undefined,
          userId: userId as string | undefined,
        })
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

      case 'storage.getForUser': {
        const check = extension.permissionChecker.checkStorageAccess()
        if (!check.allowed) {
          throw new Error(check.reason)
        }
        const userId = p['userId'] as string
        const key = p['key'] as string
        if (!userId) {
          throw new Error('userId is required for user-scoped storage')
        }
        return this.handleStorageGetForUser(extensionId, userId, key)
      }

      case 'storage.setForUser': {
        const check = extension.permissionChecker.checkStorageAccess()
        if (!check.allowed) {
          throw new Error(check.reason)
        }
        const userId = p['userId'] as string
        const key = p['key'] as string
        const value = p['value']
        if (!userId) {
          throw new Error('userId is required for user-scoped storage')
        }
        return this.handleStorageSetForUser(extensionId, userId, key, value)
      }

      case 'storage.deleteForUser': {
        const check = extension.permissionChecker.checkStorageAccess()
        if (!check.allowed) {
          throw new Error(check.reason)
        }
        const userId = p['userId'] as string
        const key = p['key'] as string
        if (!userId) {
          throw new Error('userId is required for user-scoped storage')
        }
        return this.handleStorageDeleteForUser(extensionId, userId, key)
      }

      case 'storage.keysForUser': {
        const check = extension.permissionChecker.checkStorageAccess()
        if (!check.allowed) {
          throw new Error(check.reason)
        }
        const userId = p['userId'] as string
        if (!userId) {
          throw new Error('userId is required for user-scoped storage')
        }
        return this.handleStorageKeysForUser(extensionId, userId)
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
   * Handle user-scoped storage get request (platform-specific)
   */
  protected abstract handleStorageGetForUser(extensionId: string, userId: string, key: string): Promise<unknown>

  /**
   * Handle user-scoped storage set request (platform-specific)
   */
  protected abstract handleStorageSetForUser(extensionId: string, userId: string, key: string, value: unknown): Promise<void>

  /**
   * Handle user-scoped storage delete request (platform-specific)
   */
  protected abstract handleStorageDeleteForUser(extensionId: string, userId: string, key: string): Promise<void>

  /**
   * Handle user-scoped storage keys request (platform-specific)
   */
  protected abstract handleStorageKeysForUser(extensionId: string, userId: string): Promise<string[]>

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
