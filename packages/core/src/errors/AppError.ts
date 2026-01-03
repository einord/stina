/**
 * Error codes used throughout the application
 */
export const ErrorCode = {
  // Validation errors
  VALIDATION_REQUIRED: 'VALIDATION_REQUIRED',
  VALIDATION_INVALID: 'VALIDATION_INVALID',

  // Database errors
  DB_CONNECTION_FAILED: 'DB_CONNECTION_FAILED',
  DB_QUERY_FAILED: 'DB_QUERY_FAILED',
  DB_MIGRATION_FAILED: 'DB_MIGRATION_FAILED',

  // Extension errors
  EXTENSION_NOT_FOUND: 'EXTENSION_NOT_FOUND',
  EXTENSION_INVALID_MANIFEST: 'EXTENSION_INVALID_MANIFEST',
  EXTENSION_LOAD_FAILED: 'EXTENSION_LOAD_FAILED',

  // Config errors
  CONFIG_NOT_FOUND: 'CONFIG_NOT_FOUND',
  CONFIG_INVALID: 'CONFIG_INVALID',
  CONFIG_ENCRYPTION_FAILED: 'CONFIG_ENCRYPTION_FAILED',

  // Theme errors
  THEME_NOT_FOUND: 'THEME_NOT_FOUND',

  // Chat errors
  CHAT_CONVERSATION_NOT_FOUND: 'CHAT_CONVERSATION_NOT_FOUND',
  CHAT_INTERACTION_NOT_FOUND: 'CHAT_INTERACTION_NOT_FOUND',
  CHAT_PROVIDER_NOT_FOUND: 'CHAT_PROVIDER_NOT_FOUND',
  CHAT_PROVIDER_ERROR: 'CHAT_PROVIDER_ERROR',
  CHAT_STREAM_ERROR: 'CHAT_STREAM_ERROR',

  // General errors
  UNKNOWN: 'UNKNOWN',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

/**
 * Application error with structured information
 */
export class AppError extends Error {
  public override readonly cause?: Error

  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message)
    this.name = 'AppError'
    this.cause = cause
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      context: this.context,
    }
  }
}

/**
 * Result type for operations that can fail
 */
export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E }

/**
 * Create a successful result
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

/**
 * Create a failed result
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}
