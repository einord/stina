import { EventEmitter } from 'node:events'
import { instructionRetryQueue } from '../instructionRetryQueue.js'

/**
 * Chat event types for SSE notifications
 */
export interface ChatEvent {
  type: 'instruction-received' | 'conversation-updated' | 'interaction-saved' | 'conversation-created'
  userId: string
  conversationId?: string
  sessionId?: string
  payload?: Record<string, unknown>
}

/**
 * Writer function type for direct event delivery.
 * Returns true if delivery succeeded, false otherwise.
 */
export type ChatEventWriter = (event: ChatEvent) => boolean

/**
 * Module-level event emitter for chat events.
 * Used to notify connected SSE clients about chat updates.
 */
export const chatEventEmitter = new EventEmitter()

/**
 * Registry of active SSE writers per user.
 * Used for direct delivery of instruction-received events.
 */
const userEventWriters = new Map<string, Set<ChatEventWriter>>()

/**
 * Register a writer for a user's events.
 */
export function registerWriter(userId: string, writer: ChatEventWriter): void {
  if (!userEventWriters.has(userId)) {
    userEventWriters.set(userId, new Set())
  }
  userEventWriters.get(userId)!.add(writer)
}

/**
 * Unregister a writer for a user's events.
 */
export function unregisterWriter(userId: string, writer: ChatEventWriter): void {
  const writers = userEventWriters.get(userId)
  if (writers) {
    writers.delete(writer)
    if (writers.size === 0) {
      userEventWriters.delete(userId)
    }
  }
}

/**
 * Attempt to deliver an event directly to a user's writers.
 * @returns true if at least one writer succeeded
 */
function tryDeliverToUser(userId: string, event: ChatEvent): boolean {
  const writers = userEventWriters.get(userId)
  if (!writers || writers.size === 0) return false

  let anySuccess = false
  for (const writer of writers) {
    try {
      if (writer(event)) anySuccess = true
    } catch {
      // Writer failed, continue to next
    }
  }
  return anySuccess
}

// Set up the delivery function for the retry queue
instructionRetryQueue.setDeliveryFunction((event: ChatEvent) => {
  return tryDeliverToUser(event.userId, event)
})

/**
 * Emit a chat event to all subscribed SSE clients.
 * For instruction-received events, attempts direct delivery with retry on failure.
 */
export function emitChatEvent(event: ChatEvent): void {
  if (event.type === 'instruction-received') {
    const delivered = tryDeliverToUser(event.userId, event)
    if (!delivered) {
      instructionRetryQueue.enqueue(event)
    }
    return
  }

  chatEventEmitter.emit('chat-event', event)
}

/**
 * Subscribe to chat events.
 */
export function onChatEvent(callback: (event: ChatEvent) => void): () => void {
  chatEventEmitter.on('chat-event', callback)
  return () => chatEventEmitter.off('chat-event', callback)
}
