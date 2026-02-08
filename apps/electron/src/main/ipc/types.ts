import { EventEmitter } from 'node:events'
import type {
  ChatConversationDTO,
  ChatInteractionDTO,
} from '@stina/shared'
import type { QueueState } from '@stina/chat'
import { ConversationEventBus, PendingConfirmationStore } from '@stina/chat'

/**
 * Chat event types for IPC notifications
 */
export interface ChatEvent {
  type: 'instruction-received' | 'conversation-updated' | 'interaction-saved' | 'conversation-created'
  userId: string
  conversationId?: string
  sessionId?: string
  payload?: Record<string, unknown>
}

/**
 * Chat stream event types for IPC
 */
export type ChatStreamEvent =
  | { type: 'thinking-update'; text: string; queueId?: string }
  | { type: 'content-update'; text: string; queueId?: string }
  | { type: 'tool-start'; name: string; queueId?: string }
  | { type: 'tool-complete'; tool: unknown; queueId?: string }
  | { type: 'stream-complete'; messages: unknown[]; queueId?: string }
  | { type: 'stream-error'; error: string; queueId?: string }
  | { type: 'interaction-saved'; interaction: ChatInteractionDTO; queueId?: string }
  | { type: 'conversation-created'; conversation: ChatConversationDTO; queueId?: string }
  | { type: 'interaction-started'; interactionId: string; conversationId: string; role: string; text: string; queueId?: string }
  | { type: 'queue-update'; queue: QueueState; queueId?: string }

/**
 * Global event bus for broadcasting orchestrator events to multiple clients per conversation.
 */
export const conversationEventBus = new ConversationEventBus()

/**
 * Global store for pending tool confirmations.
 */
export const pendingConfirmationStore = new PendingConfirmationStore()

/**
 * Module-level event emitter for chat events in Electron.
 */
export const chatEventEmitter = new EventEmitter()

/**
 * Emit a chat event to all subscribed renderer processes.
 */
export function emitChatEvent(event: ChatEvent): void {
  chatEventEmitter.emit('chat-event', event)
}

/**
 * Subscribe to chat events.
 */
export function onChatEvent(callback: (event: ChatEvent) => void): () => void {
  chatEventEmitter.on('chat-event', callback)
  return () => chatEventEmitter.off('chat-event', callback)
}
