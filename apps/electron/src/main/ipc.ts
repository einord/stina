import { randomUUID } from 'node:crypto'
import type { IpcMain } from 'electron'
import type {
  Greeting,
  ChatConversationSummaryDTO,
  ChatConversationDTO,
  ChatInteractionDTO,
  ModelConfigDTO,
  AppSettingsDTO,
  QuickCommandDTO,
} from '@stina/shared'
import type { ThemeRegistry, ExtensionRegistry, Logger } from '@stina/core'
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
import {
  conversationToDTO,
  conversationToSummaryDTO,
  interactionToDTO,
  dtoToInteraction,
} from '@stina/chat/mappers'
import { updateAppSettingsStore } from '@stina/chat/db'
import { ChatOrchestrator, ChatSessionManager, providerRegistry, toolRegistry } from '@stina/chat'

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
  } = ctx

  const ensureDb = (): DB => {
    if (!db) {
      throw new Error('Database not initialized')
    }
    return db
  }

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

  const getConversationRepo = () => {
    conversationRepo ??= new ConversationRepository(ensureDb(), defaultUserId)
    return conversationRepo
  }

  const getModelConfigRepo = () => {
    modelConfigRepo ??= new ModelConfigRepository(ensureDb(), defaultUserId)
    return modelConfigRepo
  }

  const getUserSettingsRepo = () => {
    if (!defaultUserId) {
      throw new Error('defaultUserId is required for UserSettingsRepository')
    }
    userSettingsRepo ??= new UserSettingsRepository(ensureDb(), defaultUserId)
    return userSettingsRepo
  }

  const getQuickCommandRepo = () => {
    quickCommandRepo ??= new QuickCommandRepository(ensureDb(), defaultUserId)
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
    return { ok: true }
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
    const modelConfigRepo = getModelConfigRepo()

    // Create model config provider adapter
    const modelConfigProvider = {
      async getDefault() {
        const config = await modelConfigRepo.getDefault()
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

  // Model configs
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
      const { name, providerId, providerExtensionId, modelId, isDefault, settingsOverride } =
        config

      if (!name || !providerId || !providerExtensionId || !modelId) {
        throw new Error('Missing required fields: name, providerId, providerExtensionId, modelId')
      }

      const id = randomUUID()
      return getModelConfigRepo().create(id, {
        name,
        providerId,
        providerExtensionId,
        modelId,
        isDefault: isDefault ?? false,
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
      const updated = await getModelConfigRepo().update(id, config)
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

  ipcMain.handle('model-configs-set-default', async (_event, id: string): Promise<{ success: boolean }> => {
    const success = await getModelConfigRepo().setDefault(id)
    if (!success) {
      throw new Error('Model config not found')
    }
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
