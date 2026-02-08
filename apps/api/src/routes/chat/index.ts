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
import { providerRegistry, toolRegistry } from '@stina/chat'
import { interactionToDTO, conversationToDTO } from '@stina/chat/mappers'
import { getDatabase } from '@stina/adapters-node'
import { asChatDb } from '../../asChatDb.js'
import { requireAuth } from '@stina/auth'
import { getUserId } from '../auth-helpers.js'
import { APP_NAMESPACE } from '@stina/core'
import { instructionRetryQueue } from '../instructionRetryQueue.js'

import type { ChatEvent, ChatEventWriter } from './eventBroadcaster.js'
import {
  chatEventEmitter,
  emitChatEvent,
  registerWriter,
  unregisterWriter,
} from './eventBroadcaster.js'
import {
  conversationEventBus,
  pendingConfirmationStore,
  getSessionManager,
  createToolDisplayNameResolver,
} from './sessionManager.js'

// Re-export everything needed by external consumers
export type { ChatEvent, ChatEventWriter } from './eventBroadcaster.js'
export {
  emitChatEvent,
  onChatEvent,
  registerWriter,
  unregisterWriter,
} from './eventBroadcaster.js'
export {
  invalidateUserSessionManager,
  queueInstructionForUser,
} from './sessionManager.js'

/**
 * SSE streaming routes for chat
 */
export const chatStreamRoutes: FastifyPluginAsync = async (fastify) => {
  const db = asChatDb(getDatabase())

  const modelConfigRepo = new ModelConfigRepository(db)

  const getRepository = (userId: string) => new ConversationRepository(db, userId)
  const getUserSettingsRepository = (userId: string) => new UserSettingsRepository(db, userId)

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

  const createGetToolDisplayName = createToolDisplayNameResolver

  const resolveSessionManager = async (userId: string) => {
    return getSessionManager(userId, {
      getRepository,
      getUserSettingsRepo: getUserSettingsRepository,
      getModelConfigProvider: createModelConfigProvider,
      getToolDisplayName: createGetToolDisplayName,
    })
  }

  /**
   * Stream chat response via SSE
   * POST /chat/stream
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
    const userId = getUserId(request)

    if (typeof message !== 'string' || (!message.trim() && !context)) {
      reply.code(400)
      return { error: 'Message is required' }
    }

    reply.hijack()

    const origin = request.headers.origin
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Credentials': 'true',
    })

    const sessionManager = await resolveSessionManager(userId)
    const session = sessionManager.getSession({ sessionId, conversationId })
    const orchestrator = session.orchestrator

    let ended = false

    const onEvent = (event: OrchestratorEvent) => {
      if (ended) return

      const shouldSend = event.type === 'queue-update' || event.queueId === queueId
      if (!shouldSend) return

      try {
        let eventToSend: Record<string, unknown> = { ...event }

        if (event.type === 'interaction-saved') {
          eventToSend = {
            type: 'interaction-saved',
            interaction: interactionToDTO(event.interaction),
            queueId: event.queueId,
          }

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

          emitChatEvent({
            type: 'conversation-created',
            userId,
            conversationId: event.conversation.id,
            sessionId,
          })
        } else if (event.type === 'stream-error') {
          eventToSend = {
            type: 'stream-error',
            error: event.error.message,
            queueId: event.queueId,
          }
        }

        reply.raw.write(`data: ${JSON.stringify(eventToSend)}\n\n`)

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

    reply.raw.on('close', cleanup)
    orchestrator.on('event', onEvent)

    try {
      if (conversationId && orchestrator.conversation?.id !== conversationId) {
        await orchestrator.loadConversation(conversationId)
      }

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
  })

  /**
   * Get current conversation state
   * GET /chat/stream/state/:conversationId
   */
  fastify.get<{
    Params: { conversationId: string }
    Querystring: { limit?: string; offset?: string }
  }>('/chat/stream/state/:conversationId', { preHandler: requireAuth }, async (request, reply) => {
    const { conversationId } = request.params
    const limit = parseInt(request.query.limit || '10', 10)
    const offset = parseInt(request.query.offset || '0', 10)
    const userId = getUserId(request)
    const repository = getRepository(userId)
    const modelConfigProvider = createModelConfigProvider(userId)

    const userSettingsRepo = getUserSettingsRepository(userId)
    const userSettings = await userSettingsRepo.get()
    const settingsStore = new AppSettingsStore(userSettings)

    const userLanguage = settingsStore.get<string>(APP_NAMESPACE, 'language') ?? 'en'
    const getToolDisplayName = createGetToolDisplayName(userLanguage)

    const orchestrator = new ChatOrchestrator(
      { userId, repository, providerRegistry, modelConfigProvider, toolRegistry, settingsStore, getToolDisplayName, userLanguage },
      { pageSize: limit }
    )

    try {
      await orchestrator.loadConversation(conversationId)

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
   * GET /chat/queue/state
   */
  fastify.get<{
    Querystring: { sessionId?: string; conversationId?: string }
  }>('/chat/queue/state', { preHandler: requireAuth }, async (request, _reply) => {
    const userId = getUserId(request)
    const sessionManager = await resolveSessionManager(userId)
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
    const userId = getUserId(request)

    if (!id) {
      reply.code(400)
      return { error: 'Queue id is required' }
    }

    const sessionManager = await resolveSessionManager(userId)
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
    const userId = getUserId(request)
    const sessionManager = await resolveSessionManager(userId)
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
    const userId = getUserId(request)
    const sessionManager = await resolveSessionManager(userId)
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
    const userId = getUserId(request)

    if (!toolCallName || typeof toolCallName !== 'string') {
      reply.code(400)
      return { error: 'toolCallName is required' }
    }

    const toolCallNamePattern = /^[a-zA-Z0-9._:-]{1,200}$/
    if (!toolCallNamePattern.test(toolCallName)) {
      reply.code(400)
      return { error: 'Invalid toolCallName format' }
    }

    if (typeof approved !== 'boolean') {
      reply.code(400)
      return { error: 'approved (boolean) is required' }
    }

    if (denialReason !== undefined && typeof denialReason === 'string' && denialReason.length > 1000) {
      reply.code(400)
      return { error: 'denialReason must be 1000 characters or less' }
    }

    const centralResolved = pendingConfirmationStore.resolve(
      toolCallName,
      { approved, denialReason },
      userId
    )

    if (centralResolved) {
      return { success: true }
    }

    const sessionManager = await resolveSessionManager(userId)
    const session = sessionManager.findSession({ sessionId, conversationId })

    if (!session) {
      reply.code(404)
      return { error: 'Chat session not found' }
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
   * SSE endpoint for chat events
   * GET /chat/events
   */
  fastify.get('/chat/events', { preHandler: requireAuth }, async (request, reply) => {
    const userId = getUserId(request)

    reply.hijack()

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

    const keepalive = setInterval(() => {
      if (ended) return
      try {
        reply.raw.write(': keepalive\n\n')
      } catch {
        // Ignore write errors (client disconnected)
      }
    }, 15000)

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

    const onEvent = (event: ChatEvent) => {
      if (ended) return
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

    registerWriter(userId, writer)

    instructionRetryQueue.onListenerConnected(userId)
  })

  /**
   * SSE endpoint for observing a conversation's event stream.
   * GET /chat/conversation/:id/stream
   */
  fastify.get<{
    Params: { id: string }
  }>('/chat/conversation/:id/stream', { preHandler: requireAuth }, async (request, reply) => {
    const { id: conversationId } = request.params
    const subscriberId = randomUUID()
    const userId = getUserId(request)

    const repository = getRepository(userId)
    const conversation = await repository.getConversation(conversationId)
    if (!conversation) {
      reply.code(403)
      return { error: 'Access denied' }
    }

    reply.hijack()

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
    }

    reply.raw.on('close', cleanup)
  })

  /**
   * Mark all interactions in a conversation as read
   * POST /chat/conversation/:id/mark-read
   */
  fastify.post<{
    Params: { id: string }
  }>('/chat/conversation/:id/mark-read', { preHandler: requireAuth }, async (request, _reply) => {
    const { id: conversationId } = request.params
    const userId = getUserId(request)
    const repository = getRepository(userId)
    await repository.markInteractionsAsRead(conversationId)
    return { success: true }
  })
}
