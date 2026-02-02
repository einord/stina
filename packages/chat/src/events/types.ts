import type { OrchestratorEvent } from '../orchestrator/types.js'

/**
 * Subscriber callback type for conversation events
 */
export type ConversationSubscriberCallback = (event: OrchestratorEvent) => void

/**
 * Subscriber for a conversation's event stream
 */
export interface ConversationSubscriber {
  /** Unique identifier for this subscriber */
  id: string
  /** Callback function invoked when events are published */
  callback: ConversationSubscriberCallback
  /** Whether this subscriber is the initiator of the current stream */
  isInitiator: boolean
  /** Optional user ID for filtering */
  userId?: string
}
