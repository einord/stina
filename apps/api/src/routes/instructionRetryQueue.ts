import type { ChatEvent } from './chatStream'

/**
 * Configuration for retry behavior
 */
interface RetryConfig {
  /** Initial delay before first retry in milliseconds */
  initialDelay: number
  /** Maximum delay between retries in milliseconds */
  maxDelay: number
  /** Maximum number of retry attempts */
  maxAttempts: number
  /** Maximum age of a message before it's discarded in milliseconds */
  maxAge: number
}

/**
 * An event queued for retry
 */
interface QueuedEvent {
  event: ChatEvent
  attempts: number
  queuedAt: number
  nextRetryAt: number
}

/**
 * Type for a delivery function that attempts to deliver an event
 */
export type DeliveryFunction = (event: ChatEvent) => boolean

const DEFAULT_CONFIG: RetryConfig = {
  initialDelay: 500,
  maxDelay: 60_000,
  maxAttempts: 10,
  maxAge: 5 * 60 * 1000, // 5 minutes
}

/**
 * In-memory retry queue for instruction messages.
 *
 * Handles queueing failed message deliveries and retrying with exponential backoff.
 * Messages are discarded after max attempts or max age is reached.
 */
export class InstructionRetryQueue {
  private queues = new Map<string, QueuedEvent[]>()
  private timers = new Map<string, NodeJS.Timeout>()
  private deliveryFn: DeliveryFunction | null = null
  private config: RetryConfig

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Set the delivery function used for retry attempts.
   * @param fn - Function that attempts to deliver an event, returns true on success
   */
  setDeliveryFunction(fn: DeliveryFunction): void {
    this.deliveryFn = fn
  }

  /**
   * Queue an event for retry.
   * @param event - The chat event to queue
   */
  enqueue(event: ChatEvent): void {
    const userId = event.userId
    if (!this.queues.has(userId)) {
      this.queues.set(userId, [])
    }

    const queue = this.queues.get(userId)!
    const now = Date.now()

    const queuedEvent: QueuedEvent = {
      event,
      attempts: 1, // First attempt already failed
      queuedAt: now,
      nextRetryAt: now + this.config.initialDelay,
    }

    queue.push(queuedEvent)
    this.scheduleRetry(userId)
  }

  /**
   * Trigger immediate delivery of queued messages when a listener connects.
   * @param userId - The user ID that connected
   */
  onListenerConnected(userId: string): void {
    const queue = this.queues.get(userId)
    if (!queue || queue.length === 0) return

    // Clear any scheduled retry
    this.clearTimer(userId)

    // Attempt immediate delivery
    this.processQueue(userId)
  }

  /**
   * Get the number of pending messages for a user.
   * @param userId - The user ID
   * @returns Number of pending messages
   */
  getPendingCount(userId: string): number {
    return this.queues.get(userId)?.length ?? 0
  }

  /**
   * Clear all queues and timers. Used for cleanup/testing.
   */
  clear(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.timers.clear()
    this.queues.clear()
  }

  /**
   * Calculate the delay for the next retry using exponential backoff.
   * Sequence: 500ms → 1s → 2s → 4s → 8s → 16s → 32s → 60s (cap)
   */
  private calculateDelay(attempts: number): number {
    const delay = this.config.initialDelay * Math.pow(2, attempts - 1)
    return Math.min(delay, this.config.maxDelay)
  }

  /**
   * Schedule a retry for a user's queue.
   */
  private scheduleRetry(userId: string): void {
    if (this.timers.has(userId)) return // Already scheduled

    const queue = this.queues.get(userId)
    if (!queue || queue.length === 0) return

    const now = Date.now()
    const nextEvent = queue[0]
    if (!nextEvent) return

    const delay = Math.max(0, nextEvent.nextRetryAt - now)

    const timer = setTimeout(() => {
      this.timers.delete(userId)
      this.processQueue(userId)
    }, delay)

    this.timers.set(userId, timer)
  }

  /**
   * Process the queue for a user, attempting delivery for each message.
   */
  private processQueue(userId: string): void {
    const queue = this.queues.get(userId)
    if (!queue || queue.length === 0) return
    if (!this.deliveryFn) return

    const now = Date.now()
    const remaining: QueuedEvent[] = []

    for (const item of queue) {
      // Check if message is too old
      if (now - item.queuedAt > this.config.maxAge) {
        continue
      }

      // Check if max attempts reached
      if (item.attempts >= this.config.maxAttempts) {
        continue
      }

      // Attempt delivery
      const delivered = this.deliveryFn(item.event)
      if (!delivered) {
        // Update for next retry
        item.attempts++
        item.nextRetryAt = now + this.calculateDelay(item.attempts)
        remaining.push(item)
      }
    }

    // Update the queue with remaining items
    this.queues.set(userId, remaining)

    // Schedule next retry if there are remaining items
    if (remaining.length > 0) {
      this.scheduleRetry(userId)
    }
  }

  /**
   * Clear the timer for a user.
   */
  private clearTimer(userId: string): void {
    const timer = this.timers.get(userId)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(userId)
    }
  }
}

// Singleton instance
export const instructionRetryQueue = new InstructionRetryQueue()
