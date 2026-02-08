import type { OrchestratorEvent } from '../orchestrator/types.js'
import type { ConversationSubscriber } from './types.js'

/**
 * Event bus for broadcasting orchestrator events to multiple subscribers per conversation.
 * Enables real-time synchronization of chat events across different clients (web, electron, api)
 * viewing the same conversation.
 */
export class ConversationEventBus {
  private subscribers = new Map<string, Set<ConversationSubscriber>>()

  /**
   * Subscribe to events for a specific conversation.
   * @param conversationId - The conversation to subscribe to
   * @param subscriber - The subscriber configuration
   * @returns Unsubscribe function
   */
  subscribe(conversationId: string, subscriber: ConversationSubscriber): () => void {
    let conversationSubscribers = this.subscribers.get(conversationId)
    if (!conversationSubscribers) {
      conversationSubscribers = new Set()
      this.subscribers.set(conversationId, conversationSubscribers)
    }

    conversationSubscribers.add(subscriber)

    return () => {
      this.unsubscribe(conversationId, subscriber.id)
    }
  }

  /**
   * Unsubscribe a specific subscriber from a conversation.
   * @param conversationId - The conversation ID
   * @param subscriberId - The subscriber's unique ID
   */
  unsubscribe(conversationId: string, subscriberId: string): void {
    const conversationSubscribers = this.subscribers.get(conversationId)
    if (!conversationSubscribers) return

    for (const subscriber of conversationSubscribers) {
      if (subscriber.id === subscriberId) {
        conversationSubscribers.delete(subscriber)
        break
      }
    }

    // Clean up empty sets
    if (conversationSubscribers.size === 0) {
      this.subscribers.delete(conversationId)
    }
  }

  /**
   * Publish an event to all subscribers of a conversation.
   * @param conversationId - The conversation ID
   * @param event - The orchestrator event to publish
   */
  publish(conversationId: string, event: OrchestratorEvent): void {
    const conversationSubscribers = this.subscribers.get(conversationId)
    if (!conversationSubscribers) return

    for (const subscriber of conversationSubscribers) {
      try {
        subscriber.callback(event)
      } catch (err) {
        // Log but don't propagate - one subscriber's error should not affect others
        console.warn('ConversationEventBus subscriber error:', err)
      }
    }
  }

  /**
   * Get the number of subscribers for a conversation.
   * @param conversationId - The conversation ID
   * @returns Number of active subscribers
   */
  getSubscriberCount(conversationId: string): number {
    const conversationSubscribers = this.subscribers.get(conversationId)
    return conversationSubscribers?.size ?? 0
  }

  /**
   * Check if a conversation has any subscribers.
   * @param conversationId - The conversation ID
   * @returns True if there are active subscribers
   */
  hasSubscribers(conversationId: string): boolean {
    return this.getSubscriberCount(conversationId) > 0
  }

  /**
   * Get all conversation IDs with active subscribers.
   * @returns Array of conversation IDs
   */
  getActiveConversations(): string[] {
    return Array.from(this.subscribers.keys())
  }

  /**
   * Clear all subscribers for a conversation.
   * @param conversationId - The conversation ID
   */
  clearConversation(conversationId: string): void {
    this.subscribers.delete(conversationId)
  }

  /**
   * Clear all subscribers from all conversations.
   */
  clearAll(): void {
    this.subscribers.clear()
  }
}
