import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { IpcMain, App } from 'electron'
import type {
  Greeting,
  ChatConversationSummaryDTO,
  ChatConversationDTO,
  ChatInteractionDTO,
  ModelConfigDTO,
  AppSettingsDTO,
  QuickCommandDTO,
  NotificationOptions,
} from '@stina/shared'
import type { ThemeRegistry, ExtensionRegistry, Logger, ConnectionConfig } from '@stina/core'
import { getConnectionConfig, setConnectionConfig } from './connectionStore.js'
import type { NodeExtensionHost } from '@stina/extension-host'
import type { ExtensionInstaller } from '@stina/extension-installer'
import type { DB } from '@stina/adapters-node'
import type { Conversation, OrchestratorEvent, QueuedMessageRole, QueueState } from '@stina/chat'
import {
  builtinExtensions,
  getPanelViews,
  getToolSettingsViews,
  mapExtensionManifestToCore,
  syncEnabledExtensions,
} from '@stina/adapters-node'
import { ConversationRepository, ModelConfigRepository, UserSettingsRepository, QuickCommandRepository, getAppSettingsStore } from '@stina/chat/db'
import type { ChatDb } from '@stina/chat/db'
import {
  conversationToDTO,
  conversationToSummaryDTO,
  interactionToDTO,
  dtoToInteraction,
} from '@stina/chat/mappers'
import { updateAppSettingsStore } from '@stina/chat/db'
import { ChatOrchestrator, ChatSessionManager, providerRegistry, toolRegistry } from '@stina/chat'
import { showNotification, isWindowFocused, focusWindow, getAvailableSounds } from './notifications.js'

/**
 * Chat event types for IPC notifications
 */
export interface ChatEvent {
  type: 'instruction-received' | 'conversation-updated' | 'interaction-saved'
  userId: string
  conversationId?: string
  sessionId?: string
  payload?: Record<string, unknown>
}

/**
 * Module-level event emitter for chat events in Electron.
 * Used to notify renderer processes about chat updates (e.g., background instructions).
 */
const chatEventEmitter = new EventEmitter()

/**
 * Emit a chat event to all subscribed renderer processes.
 * Called from main process when instruction messages are processed.
 */
export function emitChatEvent(event: ChatEvent): void {
  chatEventEmitter.emit('chat-event', event)
}

/**
 * Subscribe to chat events.
 * Returns an unsubscribe function.
 */
export function onChatEvent(callback: (event: ChatEvent) => void): () => void {
  chatEventEmitter.on('chat-event', callback)
  return () => chatEventEmitter.off('chat-event', callback)
}

/**
 * Chat stream event types for IPC
 */
export type ChatStreamEvent =
  | { type: 'thinking-update'; text: string; queueId?: string }
  | { type: 'content-update'; text: string; queueId?: string }
  | { type: 'tool-start'; name: string; queueId?: string }
  | { type: 'tool-complete'; tool: unknown; queueId?: string }
  | { type: 'stream-complete'; messages: unknown[]; queueId?: string }
  | { type: 'stream-error'; error: string; queueId?: string }
  | { type: 'interaction-saved'; interaction: ChatInteractionDTO; queueId?: string }
  | { type: 'conversation-created'; conversation: ChatConversationDTO; queueId?: string }
  | { type: 'interaction-started'; interactionId: string; conversationId: string; role: string; text: string; queueId?: string }
  | { type: 'queue-update'; queue: QueueState; queueId?: string }

/**
 * Connection test timeout in milliseconds
 */
const CONNECTION_TEST_TIMEOUT_MS = 10000

export interface IpcContext {
  getGreeting: (name?: string) => Greeting
  themeRegistry: ThemeRegistry
  extensionRegistry: ExtensionRegistry
  logger: Logger
  reloadThemes: () => Promise<void>
  extensionHost: NodeExtensionHost | null
  extensionInstaller: ExtensionInstaller | null
  db?: DB
  /** Default user ID for multi-user repository filtering in local mode */
  defaultUserId?: string
  /** Application version */
  appVersion?: string
}

/**
 * Register all IPC handlers for renderer <-> main communication
 */
export function registerIpcHandlers(ipcMain: IpcMain, ctx: IpcContext): void {
  const {
    getGreeting,
    themeRegistry,
    extensionRegistry,
    logger,
    reloadThemes,
    extensionHost,
    extensionInstaller,
    db,
    defaultUserId,
    appVersion,
  } = ctx

  const ensureDb = (): DB => {
    if (!db) {
      throw new Error('Database not initialized')
    }
    return db
  }

  // Cast db for chat repositories (compatible but different schema type)
  const ensureChatDb = (): ChatDb => ensureDb() as unknown as ChatDb

  let conversationRepo: ConversationRepository | null = null
  let modelConfigRepo: ModelConfigRepository | null = null
  let userSettingsRepo: UserSettingsRepository | null = null
  let quickCommandRepo: QuickCommandRepository | null = null

  const extensionEventListeners = new Map<number, (payload: { extensionId: string; name: string; payload?: Record<string, unknown> }) => void>()

  const unsubscribeExtensionEvents = (senderId: number) => {
    const listener = extensionEventListeners.get(senderId)
    if (listener && extensionHost) {
      extensionHost.off('extension-event', listener)
    }
    extensionEventListeners.delete(senderId)
  }

  // Chat event listeners for SSE-like notifications in Electron
  const chatEventListeners = new Map<number, (payload: { type: string; userId: string; conversationId?: string; payload?: Record<string, unknown> }) => void>()

  const unsubscribeChatEvents = (senderId: number) => {
    const listener = chatEventListeners.get(senderId)
    if (listener) {
      // Ensure listener is also unsubscribed from the underlying emitter
      const anyListener = listener as unknown as { _unsubscribe?: () => void }
      anyListener._unsubscribe?.()
      chatEventListeners.delete(senderId)
    }
  }

  const getConversationRepo = () => {
    conversationRepo ??= new ConversationRepository(ensureChatDb(), defaultUserId!)
    return conversationRepo
  }

  const getModelConfigRepo = () => {
    // Model configs are now global (no userId required)
    modelConfigRepo ??= new ModelConfigRepository(ensureChatDb())
    return modelConfigRepo
  }

  const getUserSettingsRepo = () => {
    if (!defaultUserId) {
      throw new Error('defaultUserId is required for UserSettingsRepository')
    }
    userSettingsRepo ??= new UserSettingsRepository(ensureChatDb(), defaultUserId)
    return userSettingsRepo
  }

  const getQuickCommandRepo = () => {
    quickCommandRepo ??= new QuickCommandRepository(ensureChatDb(), defaultUserId!)
    return quickCommandRepo
  }

  const syncExtensions = async () => {
    if (!extensionHost || !extensionInstaller) {
      return
    }

    const { enabledExtensions } = await syncEnabledExtensions({
      extensionInstaller,
      extensionHost,
      logger,
    })

    extensionRegistry.clear()
    for (const ext of builtinExtensions) {
      extensionRegistry.register(ext)
      logger.debug('Registered built-in extension', { id: ext.id })
    }

    for (const ext of enabledExtensions) {
      try {
        extensionRegistry.register(mapExtensionManifestToCore(ext.manifest))
        logger.debug('Registered enabled extension manifest', { id: ext.manifest.id })
      } catch (error) {
        logger.warn('Failed to register enabled extension manifest', {
          id: ext.manifest.id,
          error: String(error),
        })
      }
    }

    await reloadThemes()
  }

  // Get app version
  ipcMain.handle('get-version', () => {
    return process.env['npm_package_version'] || '0.5.0'
  })

  // Greeting
  ipcMain.handle('get-greeting', (_event, name?: string) => {
    logger.debug('IPC: get-greeting', { name })
    return getGreeting(name)
  })

  // Themes
  ipcMain.handle('get-themes', () => {
    logger.debug('IPC: get-themes')
    return themeRegistry.listThemes()
  })

  ipcMain.handle('get-theme-tokens', (_event, id: string) => {
    logger.debug('IPC: get-theme-tokens', { id })
    const theme = themeRegistry.getTheme(id)
    if (!theme) {
      throw new Error(`Theme not found: ${id}`)
    }
    return theme.tokens
  })

  ipcMain.handle('reload-themes', async () => {
    logger.debug('IPC: reload-themes')
    await reloadThemes()
  })

  // Extensions
  ipcMain.handle('get-extensions', () => {
    logger.debug('IPC: get-extensions')
    return extensionRegistry.list().map((ext) => ({
      id: ext.id,
      name: ext.name,
      version: ext.version,
      type: ext.type,
    }))
  })

  // Health check
  ipcMain.handle('health', () => {
    return { ok: true, version: appVersion }
  })

  // Tools
  ipcMain.handle('get-tools-settings', () => {
    if (!extensionHost) {
      return []
    }
    return getToolSettingsViews(extensionHost)
  })

  // Panels
  ipcMain.handle('get-panel-views', () => {
    if (!extensionHost) {
      return []
    }
    return getPanelViews(extensionHost)
  })

  ipcMain.on('extensions-events-subscribe', (event) => {
    if (!extensionHost) {
      return
    }

    const sender = event.sender
    const senderId = sender.id

    if (extensionEventListeners.has(senderId)) {
      return
    }

    const listener = (payload: { extensionId: string; name: string; payload?: Record<string, unknown> }) => {
      if (sender.isDestroyed()) {
        unsubscribeExtensionEvents(senderId)
        return
      }
      sender.send('extensions-event', payload)
    }

    extensionEventListeners.set(senderId, listener)
    extensionHost.on('extension-event', listener)

    sender.once('destroyed', () => {
      unsubscribeExtensionEvents(senderId)
    })
  })

  ipcMain.on('extensions-events-unsubscribe', (event) => {
    unsubscribeExtensionEvents(event.sender.id)
  })

  // Chat events subscription for real-time notifications (instruction messages, etc.)
  // This mirrors the SSE /chat/events endpoint behavior for Electron
  ipcMain.on('chat-events-subscribe', (event) => {
    const sender = event.sender
    const senderId = sender.id

    if (chatEventListeners.has(senderId)) {
      return
    }

    const listener = (payload: { type: string; userId: string; conversationId?: string; payload?: Record<string, unknown> }) => {
      if (sender.isDestroyed()) {
        unsubscribeChatEvents(senderId)
        return
      }
      // In local Electron mode, we send all events since there's only one user
      sender.send('chat-event', payload)
    }

    // Subscribe to chat events using the module-level emitter
    const unsubscribe = onChatEvent(listener)

    // Store listener with unsubscribe function for cleanup
    chatEventListeners.set(senderId, Object.assign(listener, { _unsubscribe: unsubscribe }))

    sender.once('destroyed', () => {
      const storedListener = chatEventListeners.get(senderId)
      // Call the unsubscribe function if available
      if (storedListener && '_unsubscribe' in storedListener) {
        (storedListener as { _unsubscribe: () => void })._unsubscribe()
      }
      unsubscribeChatEvents(senderId)
    })
  })

  ipcMain.on('chat-events-unsubscribe', (event) => {
    const senderId = event.sender.id
    const storedListener = chatEventListeners.get(senderId)
    // Call the unsubscribe function if available
    if (storedListener && '_unsubscribe' in storedListener) {
      (storedListener as { _unsubscribe: () => void })._unsubscribe()
    }
    unsubscribeChatEvents(senderId)
  })

  ipcMain.handle(
    'execute-tool',
    async (_event, extensionId: string, toolId: string, params: Record<string, unknown>) => {
      if (!extensionHost) {
        return { success: false, error: 'Extension host not initialized' }
      }
      try {
        return await extensionHost.executeTool(extensionId, toolId, params ?? {})
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  // Actions
  ipcMain.handle('extensions-get-actions', async () => {
    if (!extensionHost) {
      return []
    }
    return extensionHost.getActions()
  })

  ipcMain.handle(
    'execute-action',
    async (_event, extensionId: string, actionId: string, params: Record<string, unknown>) => {
      if (!extensionHost) {
        return { success: false, error: 'Extension host not initialized' }
      }
      try {
        return await extensionHost.executeAction(extensionId, actionId, params ?? {})
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  // Chat
  ipcMain.handle('chat-list-conversations', async (): Promise<ChatConversationSummaryDTO[]> => {
    const conversations = await getConversationRepo().listActiveConversations()
    return conversations.map(conversationToSummaryDTO)
  })

  ipcMain.handle('chat-get-conversation', async (_event, id: string): Promise<ChatConversationDTO> => {
    const conversation = await getConversationRepo().getConversation(id)
    if (!conversation) {
      throw new Error('Conversation not found')
    }
    return conversationToDTO(conversation)
  })

  ipcMain.handle('chat-get-latest-conversation', async (): Promise<ChatConversationDTO | null> => {
    const conversation = await getConversationRepo().getLatestActiveConversation()
    return conversation ? conversationToDTO(conversation) : null
  })

  ipcMain.handle(
    'chat-get-interactions',
    async (_event, conversationId: string, limit: number, offset: number): Promise<ChatInteractionDTO[]> => {
      const interactions = await getConversationRepo().getConversationInteractions(
        conversationId,
        limit,
        offset
      )
      return interactions.map(interactionToDTO)
    }
  )

  ipcMain.handle('chat-count-interactions', async (_event, conversationId: string): Promise<number> => {
    return getConversationRepo().countConversationInteractions(conversationId)
  })

  ipcMain.handle('chat-archive-conversation', async (_event, conversationId: string): Promise<void> => {
    await getConversationRepo().archiveConversation(conversationId)
  })

  ipcMain.handle(
    'chat-create-conversation',
    async (_event, id: string, title: string | undefined, createdAt: string): Promise<ChatConversationDTO> => {
      const conversation: Conversation = {
        id,
        title,
        active: true,
        interactions: [],
        metadata: { createdAt },
      }

      await getConversationRepo().saveConversation(conversation)
      return conversationToDTO(conversation)
    }
  )

  ipcMain.handle(
    'chat-save-interaction',
    async (_event, conversationId: string, interaction: ChatInteractionDTO): Promise<void> => {
      const domainInteraction = dtoToInteraction(interaction, conversationId)
      await getConversationRepo().saveInteraction(domainInteraction)
    }
  )

  // Chat session management for streaming
  let chatSessionManager: ChatSessionManager | null = null
  const chatStreamListeners = new Map<number, {
    queueId: string
    handler: (event: OrchestratorEvent) => void
    cleanup: () => void
  }>()

  const getChatSessionManager = (): ChatSessionManager => {
    if (chatSessionManager) {
      return chatSessionManager
    }

    const settingsStore = getAppSettingsStore()
    const conversationRepo = getConversationRepo()
    const globalModelConfigRepo = getModelConfigRepo()
    const userSettingsRepo = getUserSettingsRepo()

    // Create model config provider adapter
    // Gets the user's default model from user_settings, then fetches the full config from model_configs
    const modelConfigProvider = {
      async getDefault() {
        const defaultModelId = await userSettingsRepo.getDefaultModelConfigId()
        if (!defaultModelId) return null

        const config = await globalModelConfigRepo.get(defaultModelId)
        if (!config) return null

        return {
          providerId: config.providerId,
          modelId: config.modelId,
          settingsOverride: config.settingsOverride,
        }
      },
    }

    chatSessionManager = new ChatSessionManager(
      () =>
        new ChatOrchestrator(
          {
            repository: conversationRepo,
            providerRegistry,
            modelConfigProvider,
            toolRegistry,
            settingsStore,
          },
          { pageSize: 10 }
        ),
      { subscribeToSettings: true }
    )

    return chatSessionManager
  }

  // Legacy send message (deprecated, use chat-stream-message instead)
  ipcMain.handle('chat-send-message', async (): Promise<void> => {
    throw new Error('sendMessage not supported in Electron - use chat-stream-message instead')
  })

  // Stream a chat message via IPC events
  ipcMain.handle(
    'chat-stream-message',
    async (
      event,
      conversationId: string | null,
      message: string,
      options: {
        queueId: string
        role?: QueuedMessageRole
        context?: 'conversation-start' | 'settings-update'
        sessionId?: string
      }
    ): Promise<{ success: boolean; error?: string }> => {
      const { queueId, role = 'user', context, sessionId } = options
      const sender = event.sender
      const senderId = sender.id

      try {
        const sessionManager = getChatSessionManager()
        const session = sessionManager.getSession({ sessionId, conversationId: conversationId ?? undefined })
        const orchestrator = session.orchestrator

        // Set up event handler for this stream
        const onEvent = (orcEvent: OrchestratorEvent) => {
          // Only send events for this specific queue or queue updates
          const shouldSend = orcEvent.type === 'queue-update' || orcEvent.queueId === queueId
          if (!shouldSend) return

          if (sender.isDestroyed()) {
            return
          }

          // Transform events for IPC serialization
          let streamEvent: ChatStreamEvent

          switch (orcEvent.type) {
            case 'thinking-update':
              streamEvent = { type: 'thinking-update', text: orcEvent.text, queueId: orcEvent.queueId }
              break
            case 'content-update':
              streamEvent = { type: 'content-update', text: orcEvent.text, queueId: orcEvent.queueId }
              break
            case 'tool-start':
              streamEvent = { type: 'tool-start', name: orcEvent.name, queueId: orcEvent.queueId }
              break
            case 'tool-complete':
              // Serialize tool for IPC
              streamEvent = {
                type: 'tool-complete',
                tool: JSON.parse(JSON.stringify(orcEvent.tool)),
                queueId: orcEvent.queueId,
              }
              break
            case 'stream-complete':
              streamEvent = {
                type: 'stream-complete',
                messages: JSON.parse(JSON.stringify(orcEvent.messages)),
                queueId: orcEvent.queueId,
              }
              break
            case 'stream-error':
              streamEvent = {
                type: 'stream-error',
                error: orcEvent.error.message,
                queueId: orcEvent.queueId,
              }
              break
            case 'interaction-saved':
              streamEvent = {
                type: 'interaction-saved',
                interaction: interactionToDTO(orcEvent.interaction),
                queueId: orcEvent.queueId,
              }

              // Notify other clients about the new interaction
              emitChatEvent({
                type: 'interaction-saved',
                userId: defaultUserId ?? '',
                conversationId: orcEvent.interaction.conversationId,
                sessionId,
              })
              break
            case 'conversation-created':
              sessionManager.registerConversation(session.id, orcEvent.conversation.id)
              streamEvent = {
                type: 'conversation-created',
                conversation: conversationToDTO(orcEvent.conversation),
                queueId: orcEvent.queueId,
              }
              break
            case 'interaction-started':
              streamEvent = {
                type: 'interaction-started',
                interactionId: orcEvent.interactionId,
                conversationId: orcEvent.conversationId,
                role: orcEvent.role,
                text: orcEvent.text,
                queueId: orcEvent.queueId,
              }
              break
            case 'queue-update':
              streamEvent = {
                type: 'queue-update',
                queue: orcEvent.queue,
                queueId: orcEvent.queueId,
              }
              break
            default:
              // Ignore state-change and other internal events
              return
          }

          // Send event to renderer
          sender.send('chat-stream-event', streamEvent)

          // Clean up listener on stream completion or error
          if (orcEvent.type === 'stream-complete' || orcEvent.type === 'stream-error') {
            const listenerInfo = chatStreamListeners.get(senderId)
            if (listenerInfo && listenerInfo.queueId === queueId) {
              listenerInfo.cleanup()
            }
          }
        }

        // Store listener for cleanup
        const cleanup = () => {
          orchestrator.off('event', onEvent)
          chatStreamListeners.delete(senderId)
        }

        // Clean up any existing listener for this sender
        const existingListener = chatStreamListeners.get(senderId)
        if (existingListener) {
          existingListener.cleanup()
        }

        chatStreamListeners.set(senderId, { queueId, handler: onEvent, cleanup })
        orchestrator.on('event', onEvent)

        // Handle sender destruction
        sender.once('destroyed', cleanup)

        // Load conversation if specified and different from current
        if (conversationId && orchestrator.conversation?.id !== conversationId) {
          await orchestrator.loadConversation(conversationId)
        }

        // Enqueue the message - this triggers streaming
        await orchestrator.enqueueMessage(message, role, queueId, context)

        return { success: true }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        logger.error('IPC: chat-stream-message error', { error: errorMessage })

        // Send error event to renderer
        if (!sender.isDestroyed()) {
          sender.send('chat-stream-event', {
            type: 'stream-error',
            error: errorMessage,
            queueId,
          } as ChatStreamEvent)
        }

        return { success: false, error: errorMessage }
      }
    }
  )

  // Abort current streaming
  ipcMain.handle(
    'chat-stream-abort',
    async (_event, sessionId?: string, conversationId?: string): Promise<{ success: boolean }> => {
      if (!chatSessionManager) {
        return { success: false }
      }

      const session = chatSessionManager.findSession({ sessionId, conversationId })
      if (!session) {
        return { success: false }
      }

      session.orchestrator.abort()
      return { success: true }
    }
  )

  // Get queue state
  ipcMain.handle(
    'chat-queue-state',
    async (_event, sessionId?: string, conversationId?: string): Promise<QueueState> => {
      if (!chatSessionManager) {
        return { queued: [], isProcessing: false }
      }

      const session = chatSessionManager.findSession({ sessionId, conversationId })
      if (!session) {
        return { queued: [], isProcessing: false }
      }

      return session.orchestrator.getQueueState()
    }
  )

  // Remove from queue
  ipcMain.handle(
    'chat-queue-remove',
    async (_event, id: string, sessionId?: string, conversationId?: string): Promise<{ success: boolean }> => {
      if (!chatSessionManager) {
        return { success: false }
      }

      const session = chatSessionManager.findSession({ sessionId, conversationId })
      if (!session) {
        return { success: false }
      }

      const removed = session.orchestrator.removeQueued(id)
      return { success: removed }
    }
  )

  // Reset conversation and clear queue
  ipcMain.handle(
    'chat-queue-reset',
    async (_event, sessionId?: string, conversationId?: string): Promise<{ success: boolean }> => {
      if (!chatSessionManager) {
        return { success: false }
      }

      const session = chatSessionManager.findSession({ sessionId, conversationId })
      if (!session) {
        return { success: false }
      }

      session.orchestrator.resetConversation()
      return { success: true }
    }
  )

  // Extensions
  ipcMain.handle('extensions-get-available', async () => {
    if (!extensionInstaller) {
      throw new Error('Extension installer not initialized')
    }
    return extensionInstaller.getAvailableExtensions()
  })

  ipcMain.handle(
    'extensions-search',
    async (_event, query?: string, category?: string, verified?: boolean) => {
      if (!extensionInstaller) {
        throw new Error('Extension installer not initialized')
      }
      return extensionInstaller.searchExtensions({
        query,
        category: category as 'ai-provider' | 'tool' | 'theme' | 'utility' | undefined,
        verified,
      })
    }
  )

  ipcMain.handle('extensions-get-details', async (_event, id: string) => {
    if (!extensionInstaller) {
      throw new Error('Extension installer not initialized')
    }
    return extensionInstaller.getExtensionDetails(id)
  })

  ipcMain.handle('extensions-get-installed', async () => {
    if (!extensionInstaller) {
      throw new Error('Extension installer not initialized')
    }
    return extensionInstaller.getInstalledExtensions()
  })

  ipcMain.handle(
    'extensions-install',
    async (_event, extensionId: string, version?: string) => {
      if (!extensionInstaller) {
        return {
          success: false,
          extensionId,
          version: 'unknown',
          error: 'Extension installer not initialized',
        }
      }
      const result = await extensionInstaller.install(extensionId, version)
      if (result.success) {
        await syncExtensions()
      }
      return result
    }
  )

  ipcMain.handle('extensions-uninstall', async (_event, extensionId: string) => {
    if (!extensionInstaller) {
      return { success: false, error: 'Extension installer not initialized' }
    }
    const result = await extensionInstaller.uninstall(extensionId)
    if (result.success) {
      await syncExtensions()
    }
    return result
  })

  ipcMain.handle('extensions-enable', async (_event, extensionId: string) => {
    if (!extensionInstaller) {
      throw new Error('Extension installer not initialized')
    }
    extensionInstaller.enable(extensionId)
    await syncExtensions()
    return { success: true }
  })

  ipcMain.handle('extensions-disable', async (_event, extensionId: string) => {
    if (!extensionInstaller) {
      throw new Error('Extension installer not initialized')
    }
    extensionInstaller.disable(extensionId)
    await syncExtensions()
    return { success: true }
  })

  ipcMain.handle('extensions-check-updates', async () => {
    if (!extensionInstaller) {
      throw new Error('Extension installer not initialized')
    }
    return extensionInstaller.checkForUpdates()
  })

  ipcMain.handle('extensions-update', async (_event, extensionId: string, version?: string) => {
    if (!extensionInstaller) {
      return {
        success: false,
        extensionId,
        version: 'unknown',
        error: 'Extension installer not initialized',
      }
    }
    const result = await extensionInstaller.update(extensionId, version)
    if (result.success) {
      await syncExtensions()
    }
    return result
  })

  ipcMain.handle('extensions-get-settings', async (_event, extensionId: string) => {
    if (!extensionHost) {
      throw new Error('Extension host not initialized')
    }
    const extension = extensionHost.getExtension(extensionId)
    if (!extension) {
      throw new Error('Extension not found')
    }
    return {
      settings: extension.settings,
      definitions: extension.manifest.contributes?.settings ?? [],
    }
  })

  ipcMain.handle(
    'extensions-update-setting',
    async (_event, extensionId: string, key: string, value: unknown) => {
      if (!extensionHost) {
        throw new Error('Extension host not initialized')
      }
      if (!key) {
        throw new Error('Setting key is required')
      }
      await extensionHost.updateSettings(extensionId, key, value)
      return { success: true }
    }
  )

  ipcMain.handle('extensions-get-providers', async () => {
    if (!extensionHost) {
      throw new Error('Extension host not initialized')
    }
    return extensionHost.getProviders()
  })

  ipcMain.handle(
    'extensions-get-provider-models',
    async (_event, providerId: string, options?: { settings?: Record<string, unknown> }) => {
      if (!extensionHost) {
        throw new Error('Extension host not initialized')
      }
      try {
        const models = await extensionHost.getModels(providerId, options)
        // Ensure models are plain objects that can be cloned for IPC
        return models.map(m => ({
          id: m.id,
          name: m.name,
          description: m.description,
          contextLength: m.contextLength,
        }))
      } catch (error) {
        // Re-throw as a plain error message for IPC serialization
        throw new Error(error instanceof Error ? error.message : String(error))
      }
    }
  )

  ipcMain.handle('extensions-get-tools', async (_event, extensionId: string) => {
    if (!extensionHost) {
      return []
    }
    return extensionHost.getToolsForExtension(extensionId)
  })

  // Model configs (global - managed by admin)
  ipcMain.handle('model-configs-list', async (): Promise<ModelConfigDTO[]> => {
    return getModelConfigRepo().list()
  })

  ipcMain.handle('model-configs-get', async (_event, id: string): Promise<ModelConfigDTO> => {
    const config = await getModelConfigRepo().get(id)
    if (!config) {
      throw new Error('Model config not found')
    }
    return config
  })

  ipcMain.handle(
    'model-configs-create',
    async (_event, config: Omit<ModelConfigDTO, 'id' | 'createdAt' | 'updatedAt'>): Promise<ModelConfigDTO> => {
      const { name, providerId, providerExtensionId, modelId, settingsOverride } = config

      if (!name || !providerId || !providerExtensionId || !modelId) {
        throw new Error('Missing required fields: name, providerId, providerExtensionId, modelId')
      }

      const id = randomUUID()
      return getModelConfigRepo().create(id, {
        name,
        providerId,
        providerExtensionId,
        modelId,
        settingsOverride,
      })
    }
  )

  ipcMain.handle(
    'model-configs-update',
    async (
      _event,
      id: string,
      config: Partial<Omit<ModelConfigDTO, 'id' | 'createdAt' | 'updatedAt'>>
    ): Promise<ModelConfigDTO> => {
      // Extract only fields that can be updated (exclude isDefault which is now per-user)
      const { name, providerId, providerExtensionId, modelId, settingsOverride } = config
      const updated = await getModelConfigRepo().update(id, {
        name,
        providerId,
        providerExtensionId,
        modelId,
        settingsOverride,
      })
      if (!updated) {
        throw new Error('Model config not found')
      }
      return updated
    }
  )

  ipcMain.handle('model-configs-delete', async (_event, id: string): Promise<{ success: boolean }> => {
    const deleted = await getModelConfigRepo().delete(id)
    return { success: deleted }
  })

  // User's default model (per-user setting)
  ipcMain.handle('user-default-model-get', async (): Promise<ModelConfigDTO | null> => {
    const defaultModelId = await getUserSettingsRepo().getDefaultModelConfigId()
    if (!defaultModelId) return null
    return getModelConfigRepo().get(defaultModelId)
  })

  ipcMain.handle('user-default-model-set', async (_event, modelConfigId: string | null): Promise<{ success: boolean }> => {
    // If setting a model, verify it exists
    if (modelConfigId !== null) {
      const config = await getModelConfigRepo().get(modelConfigId)
      if (!config) {
        throw new Error('Model config not found')
      }
    }
    await getUserSettingsRepo().setDefaultModelConfigId(modelConfigId)
    return { success: true }
  })

  // Settings
  ipcMain.handle('settings-get', async (): Promise<AppSettingsDTO> => {
    return getUserSettingsRepo().get()
  })

  ipcMain.handle(
    'settings-update',
    async (_event, settings: Partial<AppSettingsDTO>): Promise<AppSettingsDTO> => {
      const updated = await getUserSettingsRepo().update(settings)
      updateAppSettingsStore(updated)
      return updated
    }
  )

  ipcMain.handle('settings-timezones', async (): Promise<Array<{ id: string; label: string }>> => {
    try {
      const timezones = Intl.supportedValuesOf('timeZone')
      return timezones.map((tz) => ({
        id: tz,
        label: tz.replace(/_/g, ' '),
      }))
    } catch {
      return [
        { id: 'UTC', label: 'UTC' },
        { id: 'Europe/Stockholm', label: 'Europe/Stockholm' },
        { id: 'Europe/London', label: 'Europe/London' },
        { id: 'America/New_York', label: 'America/New York' },
        { id: 'America/Los_Angeles', label: 'America/Los Angeles' },
        { id: 'Asia/Tokyo', label: 'Asia/Tokyo' },
      ]
    }
  })

  // Quick commands
  ipcMain.handle('quick-commands-list', async (): Promise<QuickCommandDTO[]> => {
    return getQuickCommandRepo().list()
  })

  ipcMain.handle('quick-commands-get', async (_event, id: string): Promise<QuickCommandDTO> => {
    const command = await getQuickCommandRepo().get(id)
    if (!command) {
      throw new Error('Quick command not found')
    }
    return command
  })

  ipcMain.handle(
    'quick-commands-create',
    async (_event, cmd: Omit<QuickCommandDTO, 'id'>): Promise<QuickCommandDTO> => {
      const { icon, command, sortOrder } = cmd
      if (!icon || !command) {
        throw new Error('Missing required fields: icon, command')
      }
      const id = randomUUID()
      const nextSortOrder = sortOrder ?? (await getQuickCommandRepo().getNextSortOrder())
      return getQuickCommandRepo().create(id, { icon, command, sortOrder: nextSortOrder })
    }
  )

  ipcMain.handle(
    'quick-commands-update',
    async (_event, id: string, cmd: Partial<Omit<QuickCommandDTO, 'id'>>): Promise<QuickCommandDTO> => {
      const updated = await getQuickCommandRepo().update(id, cmd)
      if (!updated) {
        throw new Error('Quick command not found')
      }
      return updated
    }
  )

  ipcMain.handle('quick-commands-delete', async (_event, id: string): Promise<{ success: boolean }> => {
    const deleted = await getQuickCommandRepo().delete(id)
    return { success: deleted }
  })

  ipcMain.handle('quick-commands-reorder', async (_event, ids: string[]): Promise<{ success: boolean }> => {
    await getQuickCommandRepo().reorder(ids)
    return { success: true }
  })

  logger.info('IPC handlers registered')
}

/**
 * Register notification IPC handlers.
 * These are registered separately so they work in both local and remote modes.
 */
export function registerNotificationIpcHandlers(ipcMain: IpcMain, logger: Logger): void {
  ipcMain.handle('notification-show', (_event, options: NotificationOptions) => {
    return showNotification(options)
  })

  ipcMain.handle('notification-check-focus', () => {
    return isWindowFocused()
  })

  ipcMain.handle('notification-focus-app', () => {
    focusWindow()
  })

  ipcMain.handle('notification-get-sound-support', () => {
    return {
      supported: true,
      sounds: getAvailableSounds(),
    }
  })

  logger.info('Notification IPC handlers registered')
}

/**
 * Register IPC handlers for connection configuration.
 * These handlers are registered before other handlers and work in all modes.
 */
export function registerConnectionIpcHandlers(ipcMain: IpcMain, app: App, logger: Logger): void {
  // Get current connection configuration
  ipcMain.handle('connection-get-config', (): ConnectionConfig => {
    return getConnectionConfig()
  })

  // Set connection configuration (requires app restart)
  ipcMain.handle(
    'connection-set-config',
    (_event, config: ConnectionConfig): { success: boolean; requiresRestart: boolean } => {
      logger.info('Setting connection config', { mode: config.mode, hasWebUrl: !!config.webUrl })
      setConnectionConfig(config)
      return { success: true, requiresRestart: true }
    }
  )

  // Test connection to a remote API
  ipcMain.handle(
    'connection-test',
    async (_event, url: string): Promise<{ success: boolean; error?: string }> => {
      logger.info('Testing connection', { url })
      try {
        // Normalize URL
        const normalizedUrl = url.endsWith('/') ? url.slice(0, -1) : url
        const healthUrl = `${normalizedUrl}/health`

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TEST_TIMEOUT_MS)

        const response = await fetch(healthUrl, {
          signal: controller.signal,
        })
        clearTimeout(timeoutId)

        if (response.ok) {
          const data = await response.json()
          if (data.ok === true) {
            return { success: true }
          }
        }

        return { success: false, error: `Server responded with status ${response.status}` }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.warn('Connection test failed', { url, error: errorMessage })

        if (errorMessage.includes('abort')) {
          return { success: false, error: 'Connection timed out' }
        }

        return { success: false, error: errorMessage }
      }
    }
  )

  // Restart the application
  ipcMain.handle('app-restart', (): void => {
    logger.info('Restarting application')
    app.relaunch()
    app.exit(0)
  })

  logger.info('Connection IPC handlers registered')
}

/**
 * Register IPC handlers for external browser authentication.
 * Used in remote mode when connecting to a remote Stina API.
 */
export function registerAuthIpcHandlers(ipcMain: IpcMain, logger: Logger): void {
  // Import dynamically to avoid circular dependencies
  const authModule = import('./electronAuth.js')

  // Start authentication using BrowserWindow
  ipcMain.handle(
    'auth-external-login',
    async (
      _event,
      webUrl: string
    ): Promise<{ accessToken: string; refreshToken: string }> => {
      logger.info('Starting authentication', { webUrl })
      const { electronAuthManager } = await authModule
      return electronAuthManager.authenticate(webUrl)
    }
  )

  // Get stored tokens
  ipcMain.handle(
    'auth-get-tokens',
    async (): Promise<{ accessToken: string; refreshToken: string } | null> => {
      const { secureStorage } = await authModule
      return secureStorage.getTokens()
    }
  )

  // Set/clear stored tokens
  ipcMain.handle(
    'auth-set-tokens',
    async (
      _event,
      tokens: { accessToken: string; refreshToken: string } | null
    ): Promise<{ success: boolean }> => {
      const { secureStorage } = await authModule
      if (tokens) {
        await secureStorage.setTokens(tokens)
        logger.info('Tokens stored securely')
      } else {
        await secureStorage.clearTokens()
        logger.info('Tokens cleared')
      }
      return { success: true }
    }
  )

  // Check if tokens are stored
  ipcMain.handle('auth-has-tokens', async (): Promise<boolean> => {
    const { secureStorage } = await authModule
    return secureStorage.hasTokens()
  })

  // Check if secure storage is available
  ipcMain.handle('auth-is-secure-storage-available', async (): Promise<boolean> => {
    const { secureStorage } = await authModule
    return secureStorage.isAvailable()
  })

  // Cancel pending authentication
  ipcMain.handle('auth-cancel', async (): Promise<void> => {
    const { electronAuthManager } = await authModule
    electronAuthManager.cancel()
    logger.info('Authentication cancelled')
  })

  logger.info('Auth IPC handlers registered')
}
