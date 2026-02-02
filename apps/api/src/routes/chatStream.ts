import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { FastifyPluginAsync } from 'fastify'
import { ChatOrchestrator } from '@stina/chat/orchestrator'
import type { OrchestratorEvent, QueuedMessageRole } from '@stina/chat/orchestrator'
import {
  ConversationRepository,
  ModelConfigRepository,
  UserSettingsRepository,
  AppSettingsStore,
} from '@stina/chat/db'
import type { ChatDb } from '@stina/chat/db'
import {
  providerRegistry,
  toolRegistry,
  ConversationEventBus,
  PendingConfirmationStore,
} from '@stina/chat'
import { interactionToDTO, conversationToDTO } from '@stina/chat/mappers'
import { getDatabase } from '@stina/adapters-node'
import { ChatSessionManager } from '@stina/chat'
import { requireAuth } from '@stina/auth'
import { resolveLocalizedString } from '@stina/extension-api'
import { APP_NAMESPACE } from '@stina/core'
import { instructionRetryQueue } from './instructionRetryQueue'

/**
 * Global event bus for broadcasting orchestrator events to multiple clients per conversation.
 * Enables real-time synchronization when multiple clients view the same conversation.
 */
const conversationEventBus = new ConversationEventBus()

/**
 * Global store for pending tool confirmations.
 * Allows any client connected to the same conversation to respond to tool confirmations.
 */
const pendingConfirmationStore = new PendingConfirmationStore()

/**
 * Chat event types for SSE notifications
 */
export interface ChatEvent {
  type: 'instruction-received' | 'conversation-updated' | 'interaction-saved'
  userId: string
  conversationId?: string
  sessionId?: string
  payload?: Record<string, unknown>
}

/**
 * Writer function type for direct event delivery.
 * Returns true if delivery succeeded, false otherwise.
 */
export type ChatEventWriter = (event: ChatEvent) => boolean

/**
 * Module-level event emitter for chat events.
 * Used to notify connected SSE clients about chat updates.
 */
const chatEventEmitter = new EventEmitter()

/**
 * Registry of active SSE writers per user.
 * Used for direct delivery of instruction-received events.
 */
const userEventWriters = new Map<string, Set<ChatEventWriter>>()

/**
 * Register a writer for a user's events.
 * @param userId - The user ID
 * @param writer - The writer function
 */
export function registerWriter(userId: string, writer: ChatEventWriter): void {
  if (!userEventWriters.has(userId)) {
    userEventWriters.set(userId, new Set())
  }
  userEventWriters.get(userId)!.add(writer)
}

/**
 * Unregister a writer for a user's events.
 * @param userId - The user ID
 * @param writer - The writer function to remove
 */
export function unregisterWriter(userId: string, writer: ChatEventWriter): void {
  const writers = userEventWriters.get(userId)
  if (writers) {
    writers.delete(writer)
    if (writers.size === 0) {
      userEventWriters.delete(userId)
    }
  }
}

/**
 * Attempt to deliver an event directly to a user's writers.
 * @param userId - The user ID
 * @param event - The event to deliver
 * @returns true if at least one writer succeeded, false otherwise
 */
function tryDeliverToUser(userId: string, event: ChatEvent): boolean {
  const writers = userEventWriters.get(userId)
  if (!writers || writers.size === 0) return false

  let anySuccess = false
  for (const writer of writers) {
    try {
      if (writer(event)) anySuccess = true
    } catch {
      // Writer failed, continue to next
    }
  }
  return anySuccess
}

// Set up the delivery function for the retry queue
instructionRetryQueue.setDeliveryFunction((event: ChatEvent) => {
  return tryDeliverToUser(event.userId, event)
})

/**
 * Emit a chat event to all subscribed SSE clients.
 * For instruction-received events, attempts direct delivery with retry on failure.
 */
export function emitChatEvent(event: ChatEvent): void {
  // For instruction-received: try direct delivery with retry on failure
  if (event.type === 'instruction-received') {
    const delivered = tryDeliverToUser(event.userId, event)
    if (!delivered) {
      instructionRetryQueue.enqueue(event)
    }
    return
  }

  // Other event types: use EventEmitter for broadcast
  chatEventEmitter.emit('chat-event', event)
}

/**
 * Subscribe to chat events.
 */
export function onChatEvent(callback: (event: ChatEvent) => void): () => void {
  chatEventEmitter.on('chat-event', callback)
  return () => chatEventEmitter.off('chat-event', callback)
}

// Lazy-initialized database reference for module-level functions
let _db: ChatDb | null = null
const getDb = (): ChatDb => {
  if (!_db) {
    _db = getDatabase() as unknown as ChatDb
  }
  return _db
}

// Model config repo (singleton, global)
let _modelConfigRepo: ModelConfigRepository | null = null
const getModelConfigRepo = (): ModelConfigRepository => {
  if (!_modelConfigRepo) {
    _modelConfigRepo = new ModelConfigRepository(getDb())
  }
  return _modelConfigRepo
}

/**
 * SSE streaming routes for chat
 */

/**
 * Simple async mutex implementation to prevent race conditions.
 * Ensures only one async operation can proceed at a time per key.
 */
class AsyncMutex {
  private locks = new Map<string, Promise<void>>()

  async acquire<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // Wait for any existing lock to complete
    while (this.locks.has(key)) {
      await this.locks.get(key)
    }

    // Create a new lock
    let releaseLock: () => void
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve
    })
    this.locks.set(key, lockPromise)

    try {
      // Execute the critical section
      return await fn()
    } finally {
      // Release the lock
      this.locks.delete(key)
      releaseLock!()
    }
  }
}

/**
 * Map to hold session managers per user.
 * Each user gets their own session manager with their own repository and settings.
 * Stored at module level so it can be invalidated from settings routes.
 */
const userSessionManagers = new Map<string, ChatSessionManager>()

/**
 * Mutex to synchronize access to userSessionManagers map.
 * Prevents race conditions between getSessionManager and invalidateUserSessionManager.
 */
const sessionManagerMutex = new AsyncMutex()

/**
 * Invalidate a user's session manager when their settings change.
 * This ensures the next chat session will use updated settings.
 * Uses mutex to prevent race conditions with concurrent getSessionManager calls.
 * @param userId - The user ID whose session manager should be invalidated
 */
export async function invalidateUserSessionManager(userId: string): Promise<void> {
  await sessionManagerMutex.acquire(userId, async () => {
    const manager = userSessionManagers.get(userId)
    if (manager) {
      manager.destroyAllSessions()
      userSessionManagers.delete(userId)
    }
  })
}

/**
 * Helper functions for session management (module-level for use by queueInstructionForUser)
 */
const createUserRepository = (userId: string) => new ConversationRepository(getDb(), userId)
const createUserSettingsRepository = (userId: string) => new UserSettingsRepository(getDb(), userId)

const createUserModelConfigProvider = (userId: string) => ({
  async getDefault() {
    const userSettingsRepo = createUserSettingsRepository(userId)
    const defaultModelId = await userSettingsRepo.getDefaultModelConfigId()
    if (!defaultModelId) return null

    const config = await getModelConfigRepo().get(defaultModelId)
    if (!config) return null

    return {
      providerId: config.providerId,
      modelId: config.modelId,
      settingsOverride: config.settingsOverride,
    }
  },
})

const createToolDisplayNameResolver = (userLanguage: string) => {
  return (toolId: string): string | undefined => {
    const tool = toolRegistry.get(toolId)
    if (!tool) return undefined
    return resolveLocalizedString(tool.name, userLanguage, 'en')
  }
}

/**
 * Get or create a session manager for a user (module-level for use outside routes).
 */
async function getOrCreateSessionManager(userId: string): Promise<ChatSessionManager> {
  return sessionManagerMutex.acquire(userId, async () => {
    let manager = userSessionManagers.get(userId)
    if (!manager) {
      const repository = createUserRepository(userId)
      const modelConfigProvider = createUserModelConfigProvider(userId)

      const userSettingsRepo = createUserSettingsRepository(userId)
      const userSettings = await userSettingsRepo.get()
      const settingsStore = new AppSettingsStore(userSettings)

      const userLanguage = settingsStore.get<string>(APP_NAMESPACE, 'language') ?? 'en'
      const getToolDisplayName = createToolDisplayNameResolver(userLanguage)

      manager = new ChatSessionManager(
        () =>
          new ChatOrchestrator(
            {
              userId,
              repository,
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
          )
      )
      userSessionManagers.set(userId, manager)
    }
    return manager
  })
}

/**
 * Queue an instruction message through an existing session (if available) or create a new one.
 * This allows instruction messages from extensions to be streamed to connected clients.
 *
 * @param userId - The user ID
 * @param message - The instruction message text
 * @param conversationId - Optional conversation ID (uses latest active if not specified)
 * @returns Promise with queued status and conversation ID
 */
export async function queueInstructionForUser(
  userId: string,
  message: string,
  conversationId?: string,
  logger?: { error: (msg: string, context?: Record<string, unknown>) => void }
): Promise<{ queued: boolean; conversationId?: string }> {
  try {
    const manager = await getOrCreateSessionManager(userId)

    // Find existing session for this conversation, or get/create one
    const session = manager.getSession({ conversationId })
    const orchestrator = session.orchestrator

    // Load conversation if needed
    if (conversationId && orchestrator.conversation?.id !== conversationId) {
      await orchestrator.loadConversation(conversationId)
    } else if (!orchestrator.conversation) {
      // Load latest or create new conversation
      const loaded = await orchestrator.loadLatestConversation()
      if (!loaded) {
        await orchestrator.createConversation()
      }
    }

    // Register conversation with session if newly loaded/created
    if (orchestrator.conversation && !session.conversationId) {
      manager.registerConversation(session.id, orchestrator.conversation.id)
    }

    // Queue the instruction message
    await orchestrator.enqueueMessage(message, 'instruction')

    const resultConversationId = orchestrator.conversation?.id

    // Emit event to notify connected SSE clients
    emitChatEvent({
      type: 'instruction-received',
      userId,
      conversationId: resultConversationId,
    })

    return {
      queued: true,
      conversationId: resultConversationId,
    }
  } catch (error) {
    logger?.error('Failed to queue instruction for user', { userId, error })
    return { queued: false }
  }
}

export const chatStreamRoutes: FastifyPluginAsync = async (fastify) => {
  // Cast to ChatDb since adapters-node DB is compatible but has different schema type
  const db = getDatabase() as unknown as ChatDb

  // Model configs are now global
  const modelConfigRepo = new ModelConfigRepository(db)

  /**
   * Helper to create a ConversationRepository scoped to the authenticated user.
   */
  const getRepository = (userId: string) => new ConversationRepository(db, userId)

  /**
   * Helper to create a UserSettingsRepository scoped to the authenticated user.
   */
  const getUserSettingsRepository = (userId: string) => new UserSettingsRepository(db, userId)

  /**
   * Create a model config provider for a specific user.
   * Gets the user's default model from user_settings, then fetches the full config from model_configs.
   */
  const createModelConfigProvider = (userId: string) => ({
    async getDefault() {
      const userSettingsRepo = getUserSettingsRepository(userId)
      const defaultModelId = await userSettingsRepo.getDefaultModelConfigId()
      if (!defaultModelId) return null

      const config = await modelConfigRepo.get(defaultModelId)
      if (!config) return null

      return {
        providerId: config.providerId,
        modelId: config.modelId,
        settingsOverride: config.settingsOverride,
      }
    },
  })

  /**
   * Creates a function that resolves tool IDs to localized display names.
   * Uses the user's language setting and falls back to English.
   */
  const createGetToolDisplayName = (userLanguage: string) => {
    return (toolId: string): string | undefined => {
      const tool = toolRegistry.get(toolId)
      if (!tool) return undefined
      return resolveLocalizedString(tool.name, userLanguage, 'en')
    }
  }

  /**
   * Get or create a session manager for a specific user.
   * Creates a user-specific AppSettingsStore to ensure correct language and other settings.
   * Uses mutex to prevent race conditions with concurrent invalidateUserSessionManager calls.
   * @param userId - The user ID to get or create a session manager for
   * @returns The session manager for the user
   */
  const getSessionManager = async (userId: string): Promise<ChatSessionManager> => {
    return sessionManagerMutex.acquire(userId, async () => {
      let manager = userSessionManagers.get(userId)
      if (!manager) {
        const repository = getRepository(userId)
        const modelConfigProvider = createModelConfigProvider(userId)

        // Create user-specific settings store to ensure correct language and other settings
        const userSettingsRepo = getUserSettingsRepository(userId)
        const userSettings = await userSettingsRepo.get()
        const settingsStore = new AppSettingsStore(userSettings)

        // Get user's language for tool name localization
        const userLanguage = settingsStore.get<string>(APP_NAMESPACE, 'language') ?? 'en'
        const getToolDisplayName = createGetToolDisplayName(userLanguage)

        manager = new ChatSessionManager(
          () =>
            new ChatOrchestrator(
              {
                userId,
                repository,
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
            )
        )
        userSessionManagers.set(userId, manager)
      }
      return manager
    })
  }

  /**
   * Stream chat response via SSE
   * POST /chat/stream
   *
   * Body: { conversationId?: string, message: string }
   * Response: SSE stream with OrchestratorEvents
   *
   * Event format:
   * - data: {"type": "thinking-update", "text": "..."}
   * - data: {"type": "content-update", "text": "..."}
   * - data: {"type": "tool-start", "name": "..."}
   * - data: {"type": "stream-complete", "messages": [...]}
   * - data: {"type": "interaction-saved", "interaction": {...}}
   * - data: {"type": "conversation-created", "conversation": {...}}
   * - data: [DONE]
   */
  fastify.post<{
    Body: {
      conversationId?: string
      message: string
      queueId?: string
      role?: QueuedMessageRole
      sessionId?: string
      context?: 'conversation-start' | 'settings-update'
    }
  }>('/chat/stream', { preHandler: requireAuth }, async (request, reply) => {
    const { conversationId, message, queueId: providedQueueId, role, sessionId, context } =
      request.body
    const queueId = providedQueueId ?? randomUUID()
    const userId = request.user!.id

    if (typeof message !== 'string' || (!message.trim() && !context)) {
      reply.code(400)
      return { error: 'Message is required' }
    }

    // Hijack the response - we handle it ourselves via raw stream
    // This prevents Fastify from trying to send headers/responses
    reply.hijack()

    // Set SSE headers (including CORS since we're bypassing Fastify's CORS plugin)
    const origin = request.headers.origin
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
      // CORS headers - required since reply.hijack() bypasses Fastify's CORS plugin
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Credentials': 'true',
    })

    const sessionManager = await getSessionManager(userId)
    const session = sessionManager.getSession({ sessionId, conversationId })
    const orchestrator = session.orchestrator

    // Track if stream has ended
    let ended = false

    const onEvent = (event: OrchestratorEvent) => {
      if (ended) return

      const shouldSend = event.type === 'queue-update' || event.queueId === queueId
      if (!shouldSend) return

      try {
        // Transform events that contain domain objects to DTOs
        let eventToSend: Record<string, unknown> = { ...event }

        if (event.type === 'interaction-saved') {
          eventToSend = {
            type: 'interaction-saved',
            interaction: interactionToDTO(event.interaction),
            queueId: event.queueId,
          }

          // Notify other clients about the new interaction
          emitChatEvent({
            type: 'interaction-saved',
            userId,
            conversationId: event.interaction.conversationId,
            sessionId,
          })
        } else if (event.type === 'conversation-created') {
          sessionManager.registerConversation(session.id, event.conversation.id)
          eventToSend = {
            type: 'conversation-created',
            conversation: conversationToDTO(event.conversation),
            queueId: event.queueId,
          }
        } else if (event.type === 'stream-error') {
          eventToSend = {
            type: 'stream-error',
            error: event.error.message,
            queueId: event.queueId,
          }
        }

        reply.raw.write(`data: ${JSON.stringify(eventToSend)}\n\n`)

        // End stream on completion or error
        if (event.type === 'stream-complete' || event.type === 'stream-error') {
          reply.raw.write('data: [DONE]\n\n')
          reply.raw.end()
          cleanup()
        }
      } catch {
        // Ignore write errors (client disconnected)
      }
    }

    const cleanup = () => {
      if (ended) return
      ended = true
      orchestrator.off('event', onEvent)
    }

    // Handle client disconnect - use response's close event instead of request
    reply.raw.on('close', cleanup)

    // Subscribe to orchestrator events
    orchestrator.on('event', onEvent)

    try {
      // Load conversation if specified
      if (conversationId && orchestrator.conversation?.id !== conversationId) {
        await orchestrator.loadConversation(conversationId)
      }

      // Enqueue message (this triggers streaming when it's its turn)
      await orchestrator.enqueueMessage(message, role ?? 'user', queueId, context)
    } catch (err) {
      if (!ended) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        reply.raw.write(`data: ${JSON.stringify({ type: 'stream-error', error: errorMessage })}\n\n`)
        reply.raw.write('data: [DONE]\n\n')
        reply.raw.end()
        cleanup()
      }
    }

    // Don't return anything - response is handled via raw stream
  })

  /**
   * Get current conversation state
   * GET /chat/stream/state/:conversationId
   *
   * Returns the current state including loaded interactions
   */
  fastify.get<{
    Params: { conversationId: string }
    Querystring: { limit?: string; offset?: string }
  }>('/chat/stream/state/:conversationId', { preHandler: requireAuth }, async (request, reply) => {
    const { conversationId } = request.params
    const limit = parseInt(request.query.limit || '10', 10)
    const offset = parseInt(request.query.offset || '0', 10)
    const userId = request.user!.id
    const repository = getRepository(userId)
    const modelConfigProvider = createModelConfigProvider(userId)

    // Create user-specific settings store
    const userSettingsRepo = getUserSettingsRepository(userId)
    const userSettings = await userSettingsRepo.get()
    const settingsStore = new AppSettingsStore(userSettings)

    // Get user's language for tool name localization
    const userLanguage = settingsStore.get<string>(APP_NAMESPACE, 'language') ?? 'en'
    const getToolDisplayName = createGetToolDisplayName(userLanguage)

    const orchestrator = new ChatOrchestrator(
      { userId, repository, providerRegistry, modelConfigProvider, toolRegistry, settingsStore, getToolDisplayName, userLanguage },
      { pageSize: limit }
    )

    try {
      await orchestrator.loadConversation(conversationId)

      // Load more if offset is specified
      if (offset > 0) {
        // Need to implement offset loading
      }

      const state = orchestrator.getState()
      orchestrator.destroy()

      return {
        conversation: state.conversation ? conversationToDTO(state.conversation) : null,
        interactions: state.loadedInteractions.map(interactionToDTO),
        totalInteractionsCount: state.totalInteractionsCount,
        hasMoreInteractions: orchestrator.hasMoreInteractions,
      }
    } catch {
      orchestrator.destroy()
      reply.code(404)
      return { error: 'Conversation not found' }
    }
  })

  /**
   * Get current queue state
   * GET /chat/queue/state?sessionId=...&conversationId=...
   */
  fastify.get<{
    Querystring: { sessionId?: string; conversationId?: string }
  }>('/chat/queue/state', { preHandler: requireAuth }, async (request, _reply) => {
    const userId = request.user!.id
    const sessionManager = await getSessionManager(userId)
    const session = sessionManager.findSession({
      sessionId: request.query.sessionId,
      conversationId: request.query.conversationId,
    })

    if (!session) {
      return { queued: [], isProcessing: false }
    }

    return session.orchestrator.getQueueState()
  })

  /**
   * Remove a queued message
   * POST /chat/queue/remove
   */
  fastify.post<{
    Body: { id: string; sessionId?: string; conversationId?: string }
  }>('/chat/queue/remove', { preHandler: requireAuth }, async (request, reply) => {
    const { id, sessionId, conversationId } = request.body
    const userId = request.user!.id

    if (!id) {
      reply.code(400)
      return { error: 'Queue id is required' }
    }

    const sessionManager = await getSessionManager(userId)
    const session = sessionManager.findSession({ sessionId, conversationId })
    if (!session) {
      reply.code(404)
      return { error: 'Chat session not found' }
    }

    const removed = session.orchestrator.removeQueued(id)
    return { success: removed }
  })

  /**
   * Reset conversation and clear queue
   * POST /chat/queue/reset
   */
  fastify.post<{
    Body: { sessionId?: string; conversationId?: string }
  }>('/chat/queue/reset', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.id
    const sessionManager = await getSessionManager(userId)
    const session = sessionManager.findSession({
      sessionId: request.body.sessionId,
      conversationId: request.body.conversationId,
    })

    if (!session) {
      reply.code(404)
      return { error: 'Chat session not found' }
    }

    session.orchestrator.resetConversation()
    return { success: true }
  })

  /**
   * Abort current streaming interaction
   * POST /chat/queue/abort
   */
  fastify.post<{
    Body: { sessionId?: string; conversationId?: string }
  }>('/chat/queue/abort', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.id
    const sessionManager = await getSessionManager(userId)
    const session = sessionManager.findSession({
      sessionId: request.body.sessionId,
      conversationId: request.body.conversationId,
    })

    if (!session) {
      reply.code(404)
      return { error: 'Chat session not found' }
    }

    session.orchestrator.abort()
    return { success: true }
  })

  /**
   * Respond to a pending tool confirmation
   * POST /chat/tool-confirmation/:toolCallName/respond
   */
  fastify.post<{
    Params: { toolCallName: string }
    Body: {
      approved: boolean
      denialReason?: string
      sessionId?: string
      conversationId?: string
    }
  }>('/chat/tool-confirmation/:toolCallName/respond', { preHandler: requireAuth }, async (request, reply) => {
    const { toolCallName } = request.params
    const { approved, denialReason, sessionId, conversationId } = request.body
    const userId = request.user!.id

    // Validate toolCallName format and length
    if (!toolCallName || typeof toolCallName !== 'string') {
      reply.code(400)
      return { error: 'toolCallName is required' }
    }

    // Allow alphanumeric, dots, underscores, hyphens, and colons. Max 200 chars.
    const toolCallNamePattern = /^[a-zA-Z0-9._:-]{1,200}$/
    if (!toolCallNamePattern.test(toolCallName)) {
      reply.code(400)
      return { error: 'Invalid toolCallName format' }
    }

    if (typeof approved !== 'boolean') {
      reply.code(400)
      return { error: 'approved (boolean) is required' }
    }

    // Validate denialReason length if provided
    if (denialReason !== undefined && typeof denialReason === 'string' && denialReason.length > 1000) {
      reply.code(400)
      return { error: 'denialReason must be 1000 characters or less' }
    }

    // First, try the centralized confirmation store (enables cross-client confirmation)
    const centralResolved = pendingConfirmationStore.resolve(toolCallName, {
      approved,
      denialReason,
    })

    if (centralResolved) {
      return { success: true }
    }

    // Fallback: Try finding a session and resolving locally
    const sessionManager = await getSessionManager(userId)
    const session = sessionManager.findSession({ sessionId, conversationId })

    if (!session) {
      reply.code(404)
      return { error: 'No pending confirmation found for this tool' }
    }

    const resolved = session.orchestrator.resolveToolConfirmation(toolCallName, {
      approved,
      denialReason,
    })

    if (!resolved) {
      reply.code(404)
      return { error: 'No pending confirmation found for this tool' }
    }

    return { success: true }
  })

  /**
   * SSE endpoint for chat events (instruction messages, conversation updates)
   * GET /chat/events
   *
   * Clients should subscribe to this endpoint to receive real-time notifications
   * when instruction messages are processed or conversations are updated.
   */
  fastify.get('/chat/events', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.id

    reply.hijack()

    // Set SSE headers (including CORS since we're bypassing Fastify's CORS plugin)
    const origin = request.headers.origin
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Credentials': 'true',
    })

    reply.raw.write('retry: 2000\n\n')

    let ended = false

    // Keepalive to prevent connection timeout
    const keepalive = setInterval(() => {
      if (ended) return
      try {
        reply.raw.write(': keepalive\n\n')
      } catch {
        // Ignore write errors (client disconnected)
      }
    }, 15000)

    // Writer function for direct delivery of instruction events
    const writer: ChatEventWriter = (event: ChatEvent): boolean => {
      if (ended) return false
      if (event.userId !== userId) return false
      try {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
        return true
      } catch {
        return false
      }
    }

    // EventEmitter handler for other event types
    const onEvent = (event: ChatEvent) => {
      if (ended) return
      // Only send events for this user
      if (event.userId !== userId) return
      try {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
      } catch {
        // Ignore write errors (client disconnected)
      }
    }

    const cleanup = () => {
      if (ended) return
      ended = true
      clearInterval(keepalive)
      chatEventEmitter.off('chat-event', onEvent)
      unregisterWriter(userId, writer)
    }

    reply.raw.on('close', cleanup)
    chatEventEmitter.on('chat-event', onEvent)

    // Register writer for direct delivery of instruction events
    registerWriter(userId, writer)

    // Deliver any queued messages immediately
    instructionRetryQueue.onListenerConnected(userId)
  })

  /**
   * SSE endpoint for observing a conversation's event stream.
   * GET /chat/conversation/:id/stream
   *
   * This endpoint allows multiple clients to observe the same conversation in real-time.
   * All orchestrator events (thinking, content, tools, confirmations) are broadcast to
   * subscribers. Pending tool confirmations are also sent when a client connects.
   */
  fastify.get<{
    Params: { id: string }
  }>('/chat/conversation/:id/stream', { preHandler: requireAuth }, async (request, reply) => {
    const { id: conversationId } = request.params
    const subscriberId = randomUUID()
    const userId = request.user!.id

    console.log(`[API] SSE connection opened for conversation: ${conversationId}, subscriberId: ${subscriberId}, userId: ${userId}`)

    reply.hijack()

    // Set SSE headers (including CORS since we're bypassing Fastify's CORS plugin)
    const origin = request.headers.origin
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Credentials': 'true',
    })

    reply.raw.write('retry: 2000\n\n')

    let ended = false

    // Transform orchestrator events for SSE
    const transformEvent = (event: OrchestratorEvent): Record<string, unknown> => {
      if (event.type === 'interaction-saved') {
        return {
          type: 'interaction-saved',
          interaction: interactionToDTO(event.interaction),
          queueId: event.queueId,
        }
      } else if (event.type === 'conversation-created') {
        return {
          type: 'conversation-created',
          conversation: conversationToDTO(event.conversation),
          queueId: event.queueId,
        }
      } else if (event.type === 'stream-error') {
        return {
          type: 'stream-error',
          error: event.error.message,
          queueId: event.queueId,
        }
      }
      return { ...event }
    }

    // Subscribe to conversation events
    const subscriber = {
      id: subscriberId,
      isInitiator: false,
      userId,
      callback: (event: OrchestratorEvent) => {
        if (ended) return
        try {
          reply.raw.write(`data: ${JSON.stringify(transformEvent(event))}\n\n`)
        } catch {
          // Ignore write errors (client disconnected)
        }
      },
    }

    const unsubscribe = conversationEventBus.subscribe(conversationId, subscriber)
    console.log(`[API] Subscriber registered to EventBus for conversation: ${conversationId}, total subscribers: ${conversationEventBus.getSubscriberCount(conversationId)}`)

    // Send any pending confirmations for this conversation
    const pendingConfirmations = pendingConfirmationStore.getForConversation(conversationId)
    for (const confirmation of pendingConfirmations) {
      try {
        reply.raw.write(`data: ${JSON.stringify({
          type: 'tool-confirmation-pending',
          toolCallName: confirmation.toolCallName,
          toolDisplayName: confirmation.toolCall.displayName,
          toolPayload: confirmation.toolCall.payload,
          confirmationPrompt: confirmation.toolCall.confirmationPrompt,
        })}\n\n`)
      } catch {
        // Ignore write errors
      }
    }

    // Keepalive to prevent connection timeout
    const keepalive = setInterval(() => {
      if (ended) return
      try {
        reply.raw.write(': keepalive\n\n')
      } catch {
        // Ignore write errors
      }
    }, 15000)

    const cleanup = () => {
      if (ended) return
      ended = true
      clearInterval(keepalive)
      unsubscribe()
      console.log(`[API] SSE connection closed for conversation: ${conversationId}, subscriberId: ${subscriberId}`)
    }

    reply.raw.on('close', cleanup)
  })
}
