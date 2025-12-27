import type { FastifyPluginAsync } from 'fastify'
import { ChatOrchestrator } from '@stina/chat/orchestrator'
import { ConversationRepository } from '@stina/chat/db'
import { providerRegistry, echoProvider } from '@stina/chat'
import { interactionToDTO, conversationToDTO } from '@stina/chat/mappers'
import { getDatabase } from '../db.js'

// Register EchoProvider as default (will be replaced by real providers in production)
if (!providerRegistry.has('echo')) {
  providerRegistry.register(echoProvider)
}

/**
 * SSE streaming routes for chat
 */
export const chatStreamRoutes: FastifyPluginAsync = async (fastify) => {
  const db = getDatabase()
  const repository = new ConversationRepository(db)

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
    Body: { conversationId?: string; message: string }
  }>('/chat/stream', async (request, reply) => {
    const { conversationId, message } = request.body

    if (!message || typeof message !== 'string') {
      reply.code(400)
      return { error: 'Message is required' }
    }

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    })

    const orchestrator = new ChatOrchestrator(
      {
        repository,
        providerRegistry,
        // settingsStore could be injected here in the future
      },
      { pageSize: 10 }
    )

    // Track if stream has ended
    let ended = false

    const cleanup = () => {
      if (!ended) {
        ended = true
        orchestrator.destroy()
      }
    }

    // Handle client disconnect
    request.raw.on('close', cleanup)

    // Subscribe to orchestrator events
    orchestrator.on('event', (event) => {
      if (ended) return

      try {
        // Transform events that contain domain objects to DTOs
        let eventToSend = event

        if (event.type === 'interaction-saved') {
          eventToSend = {
            type: 'interaction-saved',
            interaction: interactionToDTO(event.interaction),
          }
        } else if (event.type === 'conversation-created') {
          eventToSend = {
            type: 'conversation-created',
            conversation: conversationToDTO(event.conversation),
          }
        } else if (event.type === 'stream-error') {
          eventToSend = {
            type: 'stream-error',
            error: event.error.message,
          }
        }

        reply.raw.write(`data: ${JSON.stringify(eventToSend)}\n\n`)

        // End stream on completion or error
        if (event.type === 'stream-complete' || event.type === 'stream-error') {
          reply.raw.write('data: [DONE]\n\n')
          reply.raw.end()
          cleanup()
        }
      } catch (err) {
        // Ignore write errors (client disconnected)
      }
    })

    try {
      // Load conversation if specified
      if (conversationId) {
        await orchestrator.loadConversation(conversationId)
      }

      // Send message (this triggers streaming)
      await orchestrator.sendMessage(message)
    } catch (err) {
      if (!ended) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        reply.raw.write(`data: ${JSON.stringify({ type: 'stream-error', error: errorMessage })}\n\n`)
        reply.raw.write('data: [DONE]\n\n')
        reply.raw.end()
        cleanup()
      }
    }

    // Return nothing - response is handled via raw stream
    return reply
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
      { repository, providerRegistry },
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
    } catch (err) {
      orchestrator.destroy()
      reply.code(404)
      return { error: 'Conversation not found' }
    }
  })
}
