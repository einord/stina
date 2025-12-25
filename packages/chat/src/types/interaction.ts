import type { Message, InformationMessage } from './message.js'

/**
 * Metadata for an interaction
 */
export interface InteractionMetadata {
  createdAt: string
  [key: string]: unknown
}

/**
 * An interaction represents one exchange:
 * user message(s) + optional instructions + AI response (with thinking, tools, etc.)
 */
export interface Interaction {
  /**
   * Unique identifier
   */
  id: string

  /**
   * Parent conversation ID
   */
  conversationId: string

  /**
   * Ordered messages in this interaction
   * (user, instruction, thinking, tools, stina)
   */
  messages: Message[]

  /**
   * Information messages (shown first in UI, not sent to provider)
   */
  informationMessages: InformationMessage[]

  /**
   * Whether this interaction was aborted
   */
  aborted: boolean

  /**
   * Metadata
   */
  metadata: InteractionMetadata
}
