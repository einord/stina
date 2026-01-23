/**
 * Pending Request Manager
 *
 * Manages pending requests awaiting responses from extension workers.
 * Provides timeout handling and cleanup.
 */

/**
 * State for a pending request
 */
export interface PendingRequestState<T = unknown> {
  /** Callback to resolve with the result */
  resolve: (value: T) => void
  /** Callback to reject with an error */
  reject: (error: Error) => void
  /** Timeout handle for automatic rejection */
  timeout: ReturnType<typeof setTimeout>
}

/**
 * Options for creating a pending request
 */
export interface PendingRequestOptions {
  /** Timeout in milliseconds (default: 30000) */
  timeoutMs?: number
  /** Custom timeout error message */
  timeoutMessage?: string
}

/**
 * Manages pending requests with automatic timeout handling.
 */
export class PendingRequestManager {
  private readonly requests = new Map<string, PendingRequestState>()

  /** Default timeout in milliseconds */
  readonly defaultTimeoutMs: number

  constructor(defaultTimeoutMs = 30000) {
    this.defaultTimeoutMs = defaultTimeoutMs
  }

  /**
   * Create a pending request and return a promise
   * @param key Unique key for the request
   * @param options Request options
   * @returns Promise that resolves with the result or rejects on timeout/error
   */
  create<T>(key: string, options?: PendingRequestOptions): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs
      const timeoutMessage = options?.timeoutMessage ?? `Request timeout after ${timeoutMs}ms`

      const timeout = setTimeout(() => {
        this.requests.delete(key)
        reject(new Error(timeoutMessage))
      }, timeoutMs)

      this.requests.set(key, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      })
    })
  }

  /**
   * Resolve a pending request with a value
   * @param key The request key
   * @param value The result value
   * @returns true if the request was found and resolved
   */
  resolve<T>(key: string, value: T): boolean {
    const pending = this.requests.get(key)
    if (!pending) return false

    clearTimeout(pending.timeout)
    this.requests.delete(key)
    pending.resolve(value)
    return true
  }

  /**
   * Reject a pending request with an error
   * @param key The request key
   * @param error The error or error message
   * @returns true if the request was found and rejected
   */
  reject(key: string, error: Error | string): boolean {
    const pending = this.requests.get(key)
    if (!pending) return false

    clearTimeout(pending.timeout)
    this.requests.delete(key)
    pending.reject(error instanceof Error ? error : new Error(error))
    return true
  }

  /**
   * Check if a pending request exists
   * @param key The request key
   */
  has(key: string): boolean {
    return this.requests.has(key)
  }

  /**
   * Cancel a pending request without resolving or rejecting
   * @param key The request key
   */
  cancel(key: string): void {
    const pending = this.requests.get(key)
    if (pending) {
      clearTimeout(pending.timeout)
      this.requests.delete(key)
    }
  }

  /**
   * Get the number of pending requests
   */
  get size(): number {
    return this.requests.size
  }

  /**
   * Cancel all pending requests
   */
  cancelAll(): void {
    for (const [_key, pending] of this.requests) {
      clearTimeout(pending.timeout)
    }
    this.requests.clear()
  }
}

/**
 * Factory for creating prefixed pending request managers.
 * Useful for managing different types of requests (tools, actions, models).
 */
export class PrefixedPendingManager {
  private readonly manager: PendingRequestManager

  constructor(
    private readonly prefix: string,
    defaultTimeoutMs = 30000
  ) {
    this.manager = new PendingRequestManager(defaultTimeoutMs)
  }

  /**
   * Create a pending request with the prefix
   */
  create<T>(id: string, options?: PendingRequestOptions): Promise<T> {
    return this.manager.create(`${this.prefix}:${id}`, options)
  }

  /**
   * Resolve a pending request with the prefix
   */
  resolve<T>(id: string, value: T): boolean {
    return this.manager.resolve(`${this.prefix}:${id}`, value)
  }

  /**
   * Reject a pending request with the prefix
   */
  reject(id: string, error: Error | string): boolean {
    return this.manager.reject(`${this.prefix}:${id}`, error)
  }

  /**
   * Check if a pending request exists
   */
  has(id: string): boolean {
    return this.manager.has(`${this.prefix}:${id}`)
  }

  /**
   * Cancel a pending request
   */
  cancel(id: string): void {
    this.manager.cancel(`${this.prefix}:${id}`)
  }
}
