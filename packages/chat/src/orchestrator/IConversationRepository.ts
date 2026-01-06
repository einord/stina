import type { Conversation, Interaction } from '../types/index.js'

/**
 * Platform-neutral repository interface for conversation persistence.
 * No direct database imports - implementations provided by adapters.
 *
 * Implementations:
 * - ConversationRepository (packages/chat/db) - SQLite via Drizzle
 * - Future: HTTP adapter for web clients
 */
export interface IConversationRepository {
  /**
   * Save a new conversation to the database
   */
  saveConversation(conversation: Conversation): Promise<void>

  /**
   * Save an interaction to the database
   */
  saveInteraction(interaction: Interaction): Promise<void>

  /**
   * Get a conversation by ID with all its interactions
   */
  getConversation(id: string): Promise<Conversation | null>

  /**
   * Get the latest active conversation (without interactions for efficiency)
   */
  getLatestActiveConversation(): Promise<Conversation | null>

  /**
   * Get interactions for a conversation with pagination
   * Returns interactions ordered by createdAt DESC (newest first)
   */
  getConversationInteractions(
    conversationId: string,
    limit: number,
    offset: number
  ): Promise<Interaction[]>

  /**
   * Count total interactions for a conversation
   */
  countConversationInteractions(conversationId: string): Promise<number>

  /**
   * Archive a conversation (set active = false)
   */
  archiveConversation(id: string): Promise<void>

  /**
   * Update conversation title
   */
  updateConversationTitle(id: string, title: string): Promise<void>

  /**
   * Update conversation metadata
   */
  updateConversationMetadata(id: string, metadata: Record<string, unknown>): Promise<void>
}
