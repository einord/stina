import { randomUUID } from 'node:crypto'
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
import { providerRegistry, toolRegistry } from '@stina/chat'
import { interactionToDTO, conversationToDTO } from '@stina/chat/mappers'
import { getDatabase } from '@stina/adapters-node'
import { ChatSessionManager } from '@stina/chat'
import { requireAuth } from '@stina/auth'

/**
 * SSE streaming routes for chat
 */
/**
 * Map to hold session managers per user.
 * Each user gets their own session manager with their own repository and settings.
 * Stored at module level so it can be invalidated from settings routes.
 */
const userSessionManagers = new Map<string, ChatSessionManager>()

/**
 * Invalidate a user's session manager when their settings change.
 * This ensures the next chat session will use updated settings.
 * @param userId - The user ID whose session manager should be invalidated
 */
export function invalidateUserSessionManager(userId: string): void {
  const manager = userSessionManagers.get(userId)
  if (manager) {
    manager.destroyAllSessions()
    userSessionManagers.delete(userId)
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
   * Get or create a session manager for a specific user.
   * Creates a user-specific AppSettingsStore to ensure correct language and other settings.
   * @param userId - The user ID to get or create a session manager for
   * @returns The session manager for the user
   */
  const getSessionManager = async (userId: string): Promise<ChatSessionManager> => {
    let manager = userSessionManagers.get(userId)
    if (!manager) {
      const repository = getRepository(userId)
      const modelConfigProvider = createModelConfigProvider(userId)

      // Create user-specific settings store to ensure correct language and other settings
      const userSettingsRepo = getUserSettingsRepository(userId)
      const userSettings = await userSettingsRepo.get()
      const settingsStore = new AppSettingsStore(userSettings)

      manager = new ChatSessionManager(
        () =>
          new ChatOrchestrator(
            {
              repository,
              providerRegistry,
              modelConfigProvider,
              toolRegistry,
              settingsStore,
            },
            { pageSize: 10 }
          )
      )
      userSessionManagers.set(userId, manager)
    }
    return manager
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

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
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

    const orchestrator = new ChatOrchestrator(
      { repository, providerRegistry, modelConfigProvider, toolRegistry, settingsStore },
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
}
