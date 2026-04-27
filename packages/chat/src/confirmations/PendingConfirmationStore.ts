import type {
  PendingConfirmation,
  PendingConfirmationData,
  ToolConfirmationResponse,
} from './types.js'

/**
 * Default lifetime for a pending confirmation before it auto-expires.
 * Keeps the store from accumulating orphans when a client crashes or
 * disconnects mid-confirmation.
 */
const DEFAULT_TTL_MS = 30 * 60 * 1000

/**
 * How often the store sweeps for expired confirmations.
 */
const DEFAULT_SWEEP_INTERVAL_MS = 60 * 1000

export interface PendingConfirmationStoreOptions {
  /** Max lifetime in ms for a pending confirmation. Default: 30 minutes. */
  ttlMs?: number
  /** Sweep interval in ms. Default: 60 seconds. Set to 0 to disable the timer. */
  sweepIntervalMs?: number
  /** Time source — overridable for tests. */
  now?: () => number
}

/**
 * Centralized store for pending tool confirmations across all clients.
 * Allows any client connected to the same conversation to respond to
 * tool confirmations, regardless of which client initiated the request.
 *
 * Pending confirmations expire after `ttlMs` and are auto-resolved as
 * denied so that any awaiting promise unblocks instead of hanging forever.
 */
export class PendingConfirmationStore {
  private confirmations = new Map<string, PendingConfirmation>()
  private readonly ttlMs: number
  private readonly now: () => number
  private sweepTimer: ReturnType<typeof setInterval> | null = null

  constructor(options: PendingConfirmationStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
    this.now = options.now ?? Date.now
    const sweepIntervalMs = options.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS
    if (sweepIntervalMs > 0) {
      this.sweepTimer = setInterval(() => this.sweepExpired(), sweepIntervalMs)
      // Don't keep the event loop alive just for sweeping.
      if (typeof this.sweepTimer === 'object' && this.sweepTimer && 'unref' in this.sweepTimer) {
        ;(this.sweepTimer as { unref: () => void }).unref()
      }
    }
  }

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
   * @param userId - The user ID attempting to resolve (must match the confirmation's userId)
   * @returns True if confirmation was found and resolved, false otherwise
   */
  resolve(toolCallName: string, response: ToolConfirmationResponse, userId: string): boolean {
    const confirmation = this.confirmations.get(toolCallName)
    if (!confirmation) {
      return false
    }

    // Validate that the user resolving matches the user who created the confirmation
    if (confirmation.userId !== userId) {
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

  /**
   * Remove all confirmations older than `ttlMs` and resolve them as denied.
   * Returns the number of confirmations swept. Safe to call manually
   * (e.g. from tests); also runs automatically on a timer.
   */
  sweepExpired(): number {
    const cutoff = this.now() - this.ttlMs
    const expired: PendingConfirmation[] = []
    for (const confirmation of this.confirmations.values()) {
      if (confirmation.createdAt.getTime() <= cutoff) {
        expired.push(confirmation)
      }
    }
    for (const confirmation of expired) {
      this.confirmations.delete(confirmation.toolCallName)
      try {
        confirmation.resolve({ approved: false, denialReason: 'Confirmation timed out' })
      } catch {
        // Best-effort: a stale resolver that throws shouldn't break the sweep.
      }
    }
    return expired.length
  }

  /**
   * Stop the internal sweep timer. Call when shutting down to allow the
   * process to exit cleanly. After dispose the store still works but
   * relies on manual `sweepExpired()` calls.
   */
  dispose(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer)
      this.sweepTimer = null
    }
  }
}
