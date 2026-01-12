import { randomUUID } from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import { ChatOrchestrator } from '@stina/chat/orchestrator'
import type { OrchestratorEvent, QueuedMessageRole } from '@stina/chat/orchestrator'
import { ConversationRepository, ModelConfigRepository } from '@stina/chat/db'
import { providerRegistry, toolRegistry } from '@stina/chat'
import { interactionToDTO, conversationToDTO } from '@stina/chat/mappers'
import { getDatabase } from '@stina/adapters-node'
import { ChatSessionManager } from '@stina/chat'
import { getAppSettingsStore } from '@stina/chat/db'

/**
 * SSE streaming routes for chat
 */
export const chatStreamRoutes: FastifyPluginAsync = async (fastify) => {
  const db = getDatabase()
  const repository = new ConversationRepository(db)
  const modelConfigRepository = new ModelConfigRepository(db)
  const settingsStore = getAppSettingsStore()

  // Adapter to provide model config to orchestrator
  const modelConfigProvider = {
    async getDefault() {
      const config = await modelConfigRepository.getDefault()
      if (!config) return null
      return {
        providerId: config.providerId,
        modelId: config.modelId,
        settingsOverride: config.settingsOverride,
      }
    },
  }

  const sessionManager = new ChatSessionManager(
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
  }>('/chat/stream', async (request, reply) => {
    const { conversationId, message, queueId: providedQueueId, role, sessionId, context } =
      request.body
    const queueId = providedQueueId ?? randomUUID()

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
  }>('/chat/stream/state/:conversationId', async (request, reply) => {
    const { conversationId } = request.params
    const limit = parseInt(request.query.limit || '10', 10)
    const offset = parseInt(request.query.offset || '0', 10)

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
  }>('/chat/queue/state', async (request, reply) => {
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
  }>('/chat/queue/remove', async (request, reply) => {
    const { id, sessionId, conversationId } = request.body

    if (!id) {
      reply.code(400)
      return { error: 'Queue id is required' }
    }

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
  }>('/chat/queue/reset', async (request, reply) => {
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
  }>('/chat/queue/abort', async (request, reply) => {
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
