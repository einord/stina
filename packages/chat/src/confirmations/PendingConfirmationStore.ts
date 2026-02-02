import type {
  PendingConfirmation,
  PendingConfirmationData,
  ToolConfirmationResponse,
} from './types.js'

/**
 * Centralized store for pending tool confirmations across all clients.
 * Allows any client connected to the same conversation to respond to
 * tool confirmations, regardless of which client initiated the request.
 */
export class PendingConfirmationStore {
  private confirmations = new Map<string, PendingConfirmation>()

  /**
   * Register a new pending confirmation.
   * @param data - The confirmation data (without createdAt)
   */
  register(data: PendingConfirmationData): void {
    const confirmation: PendingConfirmation = {
      ...data,
      createdAt: new Date(),
    }
    this.confirmations.set(data.toolCallName, confirmation)
  }

  /**
   * Resolve a pending confirmation with a user response.
   * @param toolCallName - The tool call name/ID to resolve
   * @param response - The user's response (approved/denied)
   * @returns True if confirmation was found and resolved, false otherwise
   */
  resolve(toolCallName: string, response: ToolConfirmationResponse): boolean {
    const confirmation = this.confirmations.get(toolCallName)
    if (!confirmation) {
      return false
    }

    this.confirmations.delete(toolCallName)
    confirmation.resolve(response)
    return true
  }

  /**
   * Check if a confirmation exists for a tool call.
   * @param toolCallName - The tool call name/ID
   * @returns True if a pending confirmation exists
   */
  has(toolCallName: string): boolean {
    return this.confirmations.has(toolCallName)
  }

  /**
   * Get a specific pending confirmation.
   * @param toolCallName - The tool call name/ID
   * @returns The pending confirmation or undefined
   */
  get(toolCallName: string): PendingConfirmation | undefined {
    return this.confirmations.get(toolCallName)
  }

  /**
   * Get all pending confirmations for a specific conversation.
   * @param conversationId - The conversation ID
   * @returns Array of pending confirmations for the conversation
   */
  getForConversation(conversationId: string): PendingConfirmation[] {
    const result: PendingConfirmation[] = []
    for (const confirmation of this.confirmations.values()) {
      if (confirmation.conversationId === conversationId) {
        result.push(confirmation)
      }
    }
    return result
  }

  /**
   * Get all pending confirmations for a specific user.
   * @param userId - The user ID
   * @returns Array of pending confirmations for the user
   */
  getForUser(userId: string): PendingConfirmation[] {
    const result: PendingConfirmation[] = []
    for (const confirmation of this.confirmations.values()) {
      if (confirmation.userId === userId) {
        result.push(confirmation)
      }
    }
    return result
  }

  /**
   * Clear all pending confirmations for a conversation.
   * This rejects all pending confirmations with 'Conversation cleared'.
   * @param conversationId - The conversation ID
   */
  clearForConversation(conversationId: string): void {
    const toRemove: string[] = []
    for (const [toolCallName, confirmation] of this.confirmations) {
      if (confirmation.conversationId === conversationId) {
        toRemove.push(toolCallName)
        confirmation.resolve({ approved: false, denialReason: 'Conversation cleared' })
      }
    }
    for (const toolCallName of toRemove) {
      this.confirmations.delete(toolCallName)
    }
  }

  /**
   * Clear all pending confirmations.
   * This rejects all pending confirmations with 'Store cleared'.
   */
  clearAll(): void {
    for (const confirmation of this.confirmations.values()) {
      confirmation.resolve({ approved: false, denialReason: 'Store cleared' })
    }
    this.confirmations.clear()
  }

  /**
   * Get the total count of pending confirmations.
   * @returns Number of pending confirmations
   */
  get size(): number {
    return this.confirmations.size
  }
}
