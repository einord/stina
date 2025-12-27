import type { FastifyPluginAsync } from 'fastify'
import { ConversationRepository } from '@stina/chat/db'
import {
  interactionToDTO,
  conversationToDTO,
  conversationToSummaryDTO,
  dtoToInteraction,
} from '@stina/chat/mappers'
import type {
  ChatConversationSummaryDTO,
  ChatConversationDTO,
  ChatInteractionDTO,
} from '@stina/shared'
import type { Conversation } from '@stina/chat'
import { getDatabase } from '../db.js'

export const chatRoutes: FastifyPluginAsync = async (fastify) => {
  const db = getDatabase()
  const repository = new ConversationRepository(db)

  /**
   * List active conversations
   * GET /chat/conversations
   */
  fastify.get<{
    Reply: ChatConversationSummaryDTO[]
  }>('/chat/conversations', async () => {
    const conversations = await repository.listActiveConversations()
    return conversations.map(conversationToSummaryDTO)
  })

  /**
   * Get latest active conversation (without full interactions)
   * GET /chat/conversations/latest
   */
  fastify.get<{
    Reply: ChatConversationDTO | null
  }>('/chat/conversations/latest', async () => {
    const conversation = await repository.getLatestActiveConversation()
    if (!conversation) return null
    return conversationToDTO(conversation)
  })

  /**
   * Get conversation with all interactions
   * GET /chat/conversations/:id
   */
  fastify.get<{
    Params: { id: string }
    Reply: ChatConversationDTO
  }>('/chat/conversations/:id', async (request, reply) => {
    const conversation = await repository.getConversation(request.params.id)

    if (!conversation) {
      reply.code(404)
      return { error: 'Conversation not found' }
    }

    return conversationToDTO(conversation)
  })

  /**
   * Get interactions for a conversation with pagination
   * GET /chat/conversations/:id/interactions?limit=10&offset=0
   */
  fastify.get<{
    Params: { id: string }
    Querystring: { limit: string; offset: string }
    Reply: ChatInteractionDTO[]
  }>('/chat/conversations/:id/interactions', async (request) => {
    const limit = parseInt(request.query.limit, 10)
    const offset = parseInt(request.query.offset, 10)

    const interactions = await repository.getConversationInteractions(
      request.params.id,
      limit,
      offset
    )

    return interactions.map(interactionToDTO)
  })

  /**
   * Count total interactions for a conversation
   * GET /chat/conversations/:id/interactions/count
   */
  fastify.get<{
    Params: { id: string }
    Reply: { count: number }
  }>('/chat/conversations/:id/interactions/count', async (request) => {
    const count = await repository.countConversationInteractions(request.params.id)
    return { count }
  })

  /**
   * Archive a conversation
   * POST /chat/conversations/:id/archive
   */
  fastify.post<{
    Params: { id: string }
    Reply: { success: boolean }
  }>('/chat/conversations/:id/archive', async (request) => {
    await repository.archiveConversation(request.params.id)
    return { success: true }
  })

  /**
   * Create a new conversation
   * POST /chat/conversations
   */
  fastify.post<{
    Body: { id: string; title?: string; createdAt: string }
    Reply: ChatConversationDTO
  }>('/chat/conversations', async (request) => {
    const conversation: Conversation = {
      id: request.body.id,
      title: request.body.title,
      active: true,
      interactions: [],
      metadata: { createdAt: request.body.createdAt },
    }

    await repository.saveConversation(conversation)
    return conversationToDTO(conversation)
  })

  /**
   * Save an interaction
   * POST /chat/conversations/:id/interactions
   */
  fastify.post<{
    Params: { id: string }
    Body: ChatInteractionDTO
    Reply: { success: boolean }
  }>('/chat/conversations/:id/interactions', async (request) => {
    const interaction = dtoToInteraction(request.body, request.params.id)
    await repository.saveInteraction(interaction)
    return { success: true }
  })
}
