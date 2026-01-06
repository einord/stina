import { nanoid } from 'nanoid'
import type { Conversation, Interaction, Message } from '../types/index.js'

/**
 * Service for managing conversations (platform-neutral business logic)
 */
export class ConversationService {
  /**
   * Create a new conversation
   */
  createConversation(title?: string): Conversation {
    const now = new Date().toISOString()
    return {
      id: nanoid(),
      title,
      interactions: [],
      active: true,
      metadata: {
        createdAt: now,
      },
    }
  }

  /**
   * Create a new interaction within a conversation
   */
  createInteraction(conversationId: string): Interaction {
    return {
      id: nanoid(),
      conversationId,
      messages: [],
      informationMessages: [],
      aborted: false,
      error: false,
      metadata: {
        createdAt: new Date().toISOString(),
      },
    }
  }

  /**
   * Add a message to an interaction
   */
  addMessage(interaction: Interaction, message: Message): void {
    interaction.messages.push(message)
  }

  /**
   * Mark an interaction as aborted
   */
  abortInteraction(interaction: Interaction): void {
    interaction.aborted = true
  }

  /**
   * Add an interaction to a conversation
   */
  addInteraction(conversation: Conversation, interaction: Interaction): void {
    conversation.interactions.push(interaction)
  }

  /**
   * Update conversation title
   */
  updateTitle(conversation: Conversation, title: string): void {
    conversation.title = title
  }

  /**
   * Archive a conversation
   */
  archiveConversation(conversation: Conversation): void {
    conversation.active = false
  }

  /**
   * Restore a conversation
   */
  restoreConversation(conversation: Conversation): void {
    conversation.active = true
  }
}

/**
 * Singleton instance
 */
export const conversationService = new ConversationService()
