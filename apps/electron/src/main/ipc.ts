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
  ServerTimeResponse,
} from '@stina/shared'
import type { ThemeRegistry, ExtensionRegistry, Logger } from '@stina/core'
import { APP_NAMESPACE } from '@stina/core'
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
import {
  ChatOrchestrator,
  ChatSessionManager,
  providerRegistry,
  toolRegistry,
} from '@stina/chat'
import { resolveLocalizedString } from '@stina/extension-api'
import { SchedulerRepository, getScheduleDescription } from '@stina/scheduler'
import type { ChatStreamEvent } from './ipc/types.js'
import { conversationEventBus, pendingConfirmationStore, emitChatEvent, onChatEvent } from './ipc/types.js'

// Re-export types and functions from sub-modules for backwards compatibility
export type { ChatEvent, ChatStreamEvent } from './ipc/types.js'
export { emitChatEvent, onChatEvent } from './ipc/types.js'
export { registerNotificationIpcHandlers } from './ipc/notifications.js'
export { registerConnectionIpcHandlers } from './ipc/connection.js'
export { registerAuthIpcHandlers } from './ipc/auth.js'

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

function toIsoWithTimeZone(date: Date, timeZone: string): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const offsetMinutes = getUtcOffsetMinutesForTimeZone(timeZone, date)
  const sign = offsetMinutes <= 0 ? '+' : '-'
  const absOffset = Math.abs(offsetMinutes)
  const offH = pad(Math.floor(absOffset / 60))
  const offM = pad(absOffset % 60)
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}${sign}${offH}:${offM}`
}

function getUtcOffsetMinutesForTimeZone(timeZone: string, date: Date): number {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' })
  const tzStr = date.toLocaleString('en-US', { timeZone })
  return (new Date(utcStr).getTime() - new Date(tzStr).getTime()) / 60_000
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
      if ('_unsubscribe' in listener) {
        (listener as { _unsubscribe: () => void })._unsubscribe()
      }
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

  // System time
  ipcMain.handle('get-system-time', async (): Promise<ServerTimeResponse> => {
    const settingsStore = getAppSettingsStore()
    const timezone = settingsStore?.get<string>(APP_NAMESPACE, 'timezone') ?? 'UTC'
    const language = (settingsStore?.get<string>(APP_NAMESPACE, 'language') ?? 'en') as 'en' | 'sv'
    const now = new Date()
    const epochMs = now.getTime()
    const iso = toIsoWithTimeZone(now, timezone)
    return { iso, epochMs, timezone, language }
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

  // Conversation event subscription for real-time multi-window sync
  const conversationEventListeners = new Map<number, Map<string, () => void>>()

  ipcMain.on('chat-conversation-subscribe', (event, conversationId: string) => {
    const sender = event.sender
    const senderId = sender.id

    // Get or create the map of subscriptions for this sender
    let senderSubscriptions = conversationEventListeners.get(senderId)
    if (!senderSubscriptions) {
      senderSubscriptions = new Map()
      conversationEventListeners.set(senderId, senderSubscriptions)
    }

    // Skip if already subscribed to this conversation
    if (senderSubscriptions.has(conversationId)) {
      return
    }

    const subscriberId = randomUUID()
    const subscriber = {
      id: subscriberId,
      isInitiator: false,
      userId: defaultUserId,
      callback: (orcEvent: OrchestratorEvent) => {
        if (sender.isDestroyed()) {
          return
        }

        // Transform event for IPC
        let transformedEvent: Record<string, unknown> = { ...orcEvent }
        if (orcEvent.type === 'interaction-saved') {
          transformedEvent = {
            type: 'interaction-saved',
            interaction: interactionToDTO(orcEvent.interaction),
            queueId: orcEvent.queueId,
          }
        } else if (orcEvent.type === 'conversation-created') {
          transformedEvent = {
            type: 'conversation-created',
            conversation: conversationToDTO(orcEvent.conversation),
            queueId: orcEvent.queueId,
          }
        } else if (orcEvent.type === 'stream-error') {
          transformedEvent = {
            type: 'stream-error',
            error: orcEvent.error.message,
            queueId: orcEvent.queueId,
          }
        }

        sender.send('chat-conversation-event', { conversationId, event: transformedEvent })
      },
    }

    const unsubscribe = conversationEventBus.subscribe(conversationId, subscriber)
    senderSubscriptions.set(conversationId, unsubscribe)

    // Send any pending confirmations for this conversation
    const pendingConfirmations = pendingConfirmationStore.getForConversation(conversationId)
    for (const confirmation of pendingConfirmations) {
      if (!sender.isDestroyed()) {
        sender.send('chat-conversation-event', {
          conversationId,
          event: {
            type: 'tool-confirmation-pending',
            toolCallName: confirmation.toolCallName,
            toolDisplayName: confirmation.toolCall.displayName,
            toolPayload: confirmation.toolCall.payload,
            confirmationPrompt: confirmation.toolCall.confirmationPrompt,
          },
        })
      }
    }

    // Clean up when sender is destroyed
    sender.once('destroyed', () => {
      const subscriptions = conversationEventListeners.get(senderId)
      if (subscriptions) {
        for (const unsub of subscriptions.values()) {
          unsub()
        }
        conversationEventListeners.delete(senderId)
      }
    })
  })

  ipcMain.on('chat-conversation-unsubscribe', (event, conversationId: string) => {
    const senderId = event.sender.id
    const senderSubscriptions = conversationEventListeners.get(senderId)
    if (senderSubscriptions) {
      const unsubscribe = senderSubscriptions.get(conversationId)
      if (unsubscribe) {
        unsubscribe()
        senderSubscriptions.delete(conversationId)
      }
      if (senderSubscriptions.size === 0) {
        conversationEventListeners.delete(senderId)
      }
    }
  })

  // Tool confirmation response handler (supports centralized store)
  ipcMain.handle(
    'chat-tool-confirmation-respond',
    async (_event, toolCallName: string, response: { approved: boolean; denialReason?: string }, sessionId?: string, conversationId?: string): Promise<{ success: boolean; error?: string }> => {
      // First, try the centralized confirmation store (enables cross-window confirmation)
      // Validate that userId exists for user isolation
      if (!defaultUserId) {
        return { success: false, error: 'User not initialized' }
      }

      const centralResolved = pendingConfirmationStore.resolve(toolCallName, response, defaultUserId)
      if (centralResolved) {
        return { success: true }
      }

      // Fallback: Try finding a session and resolving locally
      if (!chatSessionManager) {
        return { success: false, error: 'No pending confirmation found for this tool' }
      }

      const session = chatSessionManager.findSession({ sessionId, conversationId })
      if (!session) {
        return { success: false, error: 'No pending confirmation found for this tool' }
      }

      const resolved = session.orchestrator.resolveToolConfirmation(toolCallName, response)
      if (!resolved) {
        return { success: false, error: 'No pending confirmation found for this tool' }
      }

      return { success: true }
    }
  )

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

  ipcMain.handle('chat-mark-read', async (_event, conversationId: string): Promise<{ success: boolean }> => {
    if (!defaultUserId) {
      throw new Error('No user initialized')
    }
    await getConversationRepo().markInteractionsAsRead(conversationId)
    return { success: true }
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

    // Get user's language for localization
    const userLanguage = settingsStore?.get<string>(APP_NAMESPACE, 'language') ?? 'en'

    // Create function to resolve tool display names
    const getToolDisplayName = (toolId: string): string | undefined => {
      const tool = toolRegistry.get(toolId)
      if (!tool) return undefined
      return resolveLocalizedString(tool.name, userLanguage, 'en')
    }

    chatSessionManager = new ChatSessionManager(
      () =>
        new ChatOrchestrator(
          {
            userId: defaultUserId,
            repository: conversationRepo,
            providerRegistry,
            modelConfigProvider,
            toolRegistry,
            settingsStore,
            getToolDisplayName,
            userLanguage,
            eventBus: conversationEventBus,
            confirmationStore: pendingConfirmationStore,
            subscriberId: randomUUID(),
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

              // Notify other clients about the new conversation
              emitChatEvent({
                type: 'conversation-created',
                userId: defaultUserId ?? '',
                conversationId: orcEvent.conversation.id,
                sessionId,
              })
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
    return extensionInstaller.getInstalledExtensionsWithValidation()
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

  ipcMain.handle('extensions-uninstall', async (_event, extensionId: string, deleteData?: boolean) => {
    if (!extensionInstaller) {
      return { success: false, error: 'Extension installer not initialized' }
    }

    // Unload extension from host before uninstalling
    if (extensionHost) {
      try {
        await extensionHost.unloadExtension(extensionId)
      } catch (error) {
        logger.warn('Failed to unload extension before uninstall', {
          extensionId,
          error: error instanceof Error ? error.message : String(error),
        })
        // Continue with uninstall even if unload fails
      }
    }

    const result = await extensionInstaller.uninstall(extensionId, deleteData)
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

  ipcMain.handle('extensions-upload-local', async (_event, buffer: ArrayBuffer, filename: string) => {
    if (!extensionInstaller) {
      return { success: false, extensionId: 'unknown', error: 'Extension installer not initialized' }
    }

    // Validate filename
    if (!filename.toLowerCase().endsWith('.zip')) {
      return { success: false, extensionId: 'unknown', error: 'Only ZIP files are allowed' }
    }

    // Validate file content (ZIP magic bytes: PK\x03\x04 = 0x50 0x4B 0x03 0x04)
    const fileBuffer = Buffer.from(buffer)
    if (
      fileBuffer.length < 4 ||
      fileBuffer[0] !== 0x50 ||
      fileBuffer[1] !== 0x4b ||
      fileBuffer[2] !== 0x03 ||
      fileBuffer[3] !== 0x04
    ) {
      return { success: false, extensionId: 'unknown', error: 'Invalid ZIP file format' }
    }

    // Convert Buffer to Readable stream
    const { Readable } = await import('stream')
    const stream = Readable.from(fileBuffer)

    const result = await extensionInstaller.installLocalExtension(stream)
    if (result.success) await syncExtensions()
    return result
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

  // Scheduled jobs
  const schedulerRepo = new SchedulerRepository(ensureDb())

  ipcMain.handle('scheduled-jobs-list', async () => {
    if (!defaultUserId) {
      return []
    }
    const jobs = schedulerRepo.listByUserId(defaultUserId)
    return jobs.map((job) => ({
      id: job.id,
      extensionId: job.extensionId,
      jobId: job.jobId,
      userId: job.userId ?? defaultUserId,
      scheduleType: job.scheduleType,
      scheduleDescription: getScheduleDescription(job.scheduleType, job.scheduleValue, job.timezone),
      nextRunAt: job.nextRunAt,
      lastRunAt: job.lastRunAt,
      enabled: job.enabled,
      createdAt: job.createdAt,
    }))
  })

  ipcMain.handle('scheduled-jobs-get', async (_event, id: string) => {
    if (!defaultUserId) {
      throw new Error('User not initialized')
    }
    const job = schedulerRepo.getByIdForUser(id, defaultUserId)
    if (!job) {
      throw new Error('Job not found')
    }

    // Get extension name if available
    let extensionName: string | null = null
    if (extensionHost) {
      const extension = extensionHost.getExtension(job.extensionId)
      if (extension) {
        extensionName = extension.manifest.name ?? null
      }
    }

    // Parse payload
    let payload: Record<string, unknown> | null = null
    if (job.payloadJson) {
      try {
        payload = JSON.parse(job.payloadJson) as Record<string, unknown>
      } catch {
        // Invalid JSON, leave as null
      }
    }

    return {
      id: job.id,
      extensionId: job.extensionId,
      jobId: job.jobId,
      userId: job.userId ?? defaultUserId,
      scheduleType: job.scheduleType,
      scheduleDescription: getScheduleDescription(job.scheduleType, job.scheduleValue, job.timezone),
      scheduleValue: job.scheduleValue,
      timezone: job.timezone,
      misfirePolicy: job.misfirePolicy,
      nextRunAt: job.nextRunAt,
      lastRunAt: job.lastRunAt,
      enabled: job.enabled,
      createdAt: job.createdAt,
      payload,
      extensionName,
    }
  })

  ipcMain.handle('scheduled-jobs-delete', async (_event, id: string): Promise<{ success: boolean }> => {
    if (!defaultUserId) {
      return { success: false }
    }
    const deleted = schedulerRepo.delete(id, defaultUserId)
    return { success: deleted }
  })

  logger.info('IPC handlers registered')
}


