import { conversations, interactions } from './schema.js'
import type { ChatDb } from './schema.js'
import type { Conversation, Interaction } from '../types/index.js'
import type { IConversationRepository } from '../orchestrator/IConversationRepository.js'
import { eq, desc } from 'drizzle-orm'

/**
 * Database repository for chat data.
 * Implements IConversationRepository for use with ChatOrchestrator.
 * Accepts a chat database instance.
 */
export class ConversationRepository implements IConversationRepository {
  constructor(private db: ChatDb) {}

  /**
   * Save a conversation to database
   */
  async saveConversation(conversation: Conversation): Promise<void> {
    await this.db.insert(conversations).values({
      id: conversation.id,
      title: conversation.title ?? null,
      createdAt: new Date(conversation.metadata.createdAt),
      active: conversation.active,
      metadata: conversation.metadata as Record<string, unknown>,
    })
  }

  /**
   * Save an interaction to database
   */
  async saveInteraction(interaction: Interaction): Promise<void> {
    await this.db.insert(interactions).values({
      id: interaction.id,
      conversationId: interaction.conversationId,
      createdAt: new Date(interaction.metadata.createdAt),
      aborted: interaction.aborted,
      error: interaction.error,
      errorMessage: interaction.errorMessage ?? null,
      messages: interaction.messages,
      informationMessages: interaction.informationMessages,
      metadata: interaction.metadata,
    })
  }

  /**
   * Get a conversation with all its interactions
   */
  async getConversation(id: string): Promise<Conversation | null> {
    const convResults = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1)

    const conv = convResults[0]
    if (!conv) return null

    const inters = await this.db
      .select()
      .from(interactions)
      .where(eq(interactions.conversationId, id))
      .orderBy(desc(interactions.createdAt))

    return {
      id: conv.id,
      title: conv.title ?? undefined,
      active: conv.active,
      interactions: inters.map((i) => ({
        id: i.id,
        conversationId: i.conversationId,
        messages: i.messages,
        informationMessages: i.informationMessages ?? [],
        aborted: i.aborted,
        error: i.error,
        errorMessage: i.errorMessage ?? undefined,
        metadata: {
          createdAt: i.createdAt.toISOString(),
          ...(typeof i.metadata === 'object' && i.metadata
            ? (i.metadata as Record<string, unknown>)
            : {}),
        },
      })),
      metadata: {
        createdAt: conv.createdAt.toISOString(),
        ...(typeof conv.metadata === 'object' && conv.metadata
          ? (conv.metadata as Record<string, unknown>)
          : {}),
      },
    }
  }

  /**
   * List all active conversations
   */
  async listActiveConversations(): Promise<Conversation[]> {
    const convs = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.active, true))
      .orderBy(desc(conversations.createdAt))

    const result: Conversation[] = []
    for (const c of convs) {
      const conv = await this.getConversation(c.id)
      if (conv) result.push(conv)
    }
    return result
  }

  /**
   * Update conversation title
   */
  async updateConversationTitle(id: string, title: string): Promise<void> {
    await this.db
      .update(conversations)
      .set({ title })
      .where(eq(conversations.id, id))
  }

  /**
   * Update conversation metadata
   */
  async updateConversationMetadata(id: string, metadata: Record<string, unknown>): Promise<void> {
    await this.db
      .update(conversations)
      .set({ metadata })
      .where(eq(conversations.id, id))
  }

  /**
   * Archive a conversation (set active = false)
   */
  async archiveConversation(id: string): Promise<void> {
    await this.db
      .update(conversations)
      .set({ active: false })
      .where(eq(conversations.id, id))
  }

  /**
   * Restore a conversation (set active = true)
   */
  async restoreConversation(id: string): Promise<void> {
    await this.db
      .update(conversations)
      .set({ active: true })
      .where(eq(conversations.id, id))
  }

  /**
   * Delete a conversation and all its interactions (CASCADE)
   */
  async deleteConversation(id: string): Promise<void> {
    await this.db.delete(conversations).where(eq(conversations.id, id))
  }

  /**
   * Get interactions for a conversation with pagination
   * Returns interactions ordered by createdAt DESC (newest first)
   */
  async getConversationInteractions(
    conversationId: string,
    limit: number,
    offset: number
  ): Promise<Interaction[]> {
    const inters = await this.db
      .select()
      .from(interactions)
      .where(eq(interactions.conversationId, conversationId))
      .orderBy(desc(interactions.createdAt))
      .limit(limit)
      .offset(offset)

    return inters.map((i) => ({
      id: i.id,
      conversationId: i.conversationId,
      messages: i.messages,
      informationMessages: i.informationMessages ?? [],
      aborted: i.aborted,
      error: i.error,
      errorMessage: i.errorMessage ?? undefined,
      metadata: {
        createdAt: i.createdAt.toISOString(),
        ...(typeof i.metadata === 'object' && i.metadata
          ? (i.metadata as Record<string, unknown>)
          : {}),
      },
    }))
  }

  /**
   * Count total interactions for a conversation
   */
  async countConversationInteractions(conversationId: string): Promise<number> {
    const result = await this.db
      .select()
      .from(interactions)
      .where(eq(interactions.conversationId, conversationId))

    return result.length
  }

  /**
   * Get the latest active conversation (without interactions)
   * Returns null if no active conversation exists
   */
  async getLatestActiveConversation(): Promise<Conversation | null> {
    const convResults = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.active, true))
      .orderBy(desc(conversations.createdAt))
      .limit(1)

    const conv = convResults[0]
    if (!conv) return null

    return {
      id: conv.id,
      title: conv.title ?? undefined,
      active: conv.active,
      interactions: [],
      metadata: {
        createdAt: conv.createdAt.toISOString(),
        ...(typeof conv.metadata === 'object' && conv.metadata
          ? (conv.metadata as Record<string, unknown>)
          : {}),
      },
    }
  }
}
