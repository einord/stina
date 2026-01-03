import type { Interaction } from './interaction.js'

/**
 * Metadata for a conversation
 */
export interface ConversationMetadata {
  createdAt: string
  [key: string]: unknown
}

/**
 * A conversation contains multiple interactions
 */
export interface Conversation {
  /**
   * Unique identifier
   */
  id: string

  /**
   * Optional title
   */
  title?: string

  /**
   * All interactions in this conversation
   */
  interactions: Interaction[]

  /**
   * Whether this conversation is active
   */
  active: boolean

  /**
   * Metadata
   */
  metadata: ConversationMetadata
}
