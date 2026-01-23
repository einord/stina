/**
 * Streaming Request Manager
 *
 * Manages streaming requests from extension workers.
 * Provides a shared implementation for both Web and Node extension hosts.
 */

import type { StreamEvent } from '@stina/extension-api'

/**
 * State for a streaming request
 */
export interface StreamingRequest {
  /** Buffered events waiting to be consumed */
  events: StreamEvent[]
  /** Whether the stream has completed */
  done: boolean
  /** Error that occurred during streaming */
  error?: Error
  /** Callback to resolve when new events arrive */
  resolve?: () => void
  /** Callback to reject on error */
  reject?: (error: Error) => void
}

/**
 * Manages streaming requests with async iteration support.
 * Handles buffering, backpressure, and cleanup.
 */
export class StreamingRequestManager {
  private readonly requests = new Map<string, StreamingRequest>()

  /**
   * Create a new streaming request
   * @param requestId Unique request ID
   * @returns The streaming request state
   */
  create(requestId: string): StreamingRequest {
    const request: StreamingRequest = {
      events: [],
      done: false,
    }
    this.requests.set(requestId, request)
    return request
  }

  /**
   * Get an existing streaming request
   * @param requestId The request ID
   * @returns The streaming request or undefined
   */
  get(requestId: string): StreamingRequest | undefined {
    return this.requests.get(requestId)
  }

  /**
   * Add an event to a streaming request
   * @param requestId The request ID
   * @param event The stream event to add
   */
  addEvent(requestId: string, event: StreamEvent): void {
    const request = this.requests.get(requestId)
    if (!request) return

    request.events.push(event)

    // Wake up any waiting consumer
    if (request.resolve) {
      request.resolve()
    }
  }

  /**
   * Mark a streaming request as complete
   * @param requestId The request ID
   */
  complete(requestId: string): void {
    const request = this.requests.get(requestId)
    if (!request) return

    request.done = true

    // Wake up any waiting consumer
    if (request.resolve) {
      request.resolve()
    }
  }

  /**
   * Mark a streaming request as failed
   * @param requestId The request ID
   * @param error The error that occurred
   */
  fail(requestId: string, error: Error): void {
    const request = this.requests.get(requestId)
    if (!request) return

    request.error = error
    request.done = true

    // Notify any waiting consumer
    if (request.reject) {
      request.reject(error)
    } else if (request.resolve) {
      request.resolve()
    }
  }

  /**
   * Clean up a streaming request
   * @param requestId The request ID
   */
  cleanup(requestId: string): void {
    this.requests.delete(requestId)
  }

  /**
   * Check if a streaming request exists
   * @param requestId The request ID
   */
  has(requestId: string): boolean {
    return this.requests.has(requestId)
  }

  /**
   * Create an async generator for consuming stream events.
   * This provides a convenient way to iterate over events.
   * @param requestId The request ID
   */
  async *iterate(requestId: string): AsyncGenerator<StreamEvent, void, unknown> {
    const request = this.requests.get(requestId)
    if (!request) {
      throw new Error(`Streaming request ${requestId} not found`)
    }

    try {
      while (!request.done) {
        // Wait for events if buffer is empty
        if (request.events.length === 0) {
          await new Promise<void>((resolve, reject) => {
            request.resolve = resolve
            request.reject = reject
          })
        }

        // Check for error
        if (request.error) {
          throw request.error
        }

        // Yield all buffered events
        while (request.events.length > 0) {
          const event = request.events.shift()!
          if (event.type === 'done') {
            request.done = true
          } else if (event.type === 'error') {
            throw new Error(event.message)
          }
          yield event
        }
      }
    } finally {
      this.cleanup(requestId)
    }
  }
}
