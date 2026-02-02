import type { ToolCall } from '../types/index.js'

/**
 * Response for tool confirmation
 */
export interface ToolConfirmationResponse {
  approved: boolean
  denialReason?: string
}

/**
 * Resolver function type for pending confirmations
 */
export type ConfirmationResolver = (response: ToolConfirmationResponse) => void

/**
 * Represents a pending tool confirmation awaiting user response
 */
export interface PendingConfirmation {
  /** The tool call name/ID used as identifier */
  toolCallName: string
  /** The tool call details */
  toolCall: ToolCall
  /** The conversation this confirmation belongs to */
  conversationId: string
  /** The user who initiated the tool call */
  userId: string
  /** When the confirmation was created */
  createdAt: Date
  /** Resolver function to complete the confirmation */
  resolve: ConfirmationResolver
}

/**
 * Data needed to register a new pending confirmation
 */
export type PendingConfirmationData = Omit<PendingConfirmation, 'createdAt'>
