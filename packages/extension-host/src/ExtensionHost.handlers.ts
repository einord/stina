/**
 * Extension Host Request Handlers
 *
 * Infrastructure for handling requests from extension workers.
 * Each handler module implements the RequestHandler interface.
 */

import type { RequestMethod } from '@stina/extension-api'
import type { LoadedExtension, ExtensionHostOptions } from './ExtensionHost.types.js'

// ============================================================================
// Handler Context
// ============================================================================

/**
 * Context provided to request handlers.
 *
 * Note: This context is for extension-to-host requests (e.g., storage, scheduler).
 * User context (userId) is passed explicitly in the request payload for operations
 * that require it, not via this context object.
 */
export interface HandlerContext {
  /** The extension ID making the request */
  extensionId: string
  /** The loaded extension instance */
  extension: LoadedExtension
  /** Extension host options for accessing services */
  options: ExtensionHostOptions
  /** Logger for debugging */
  logger?: ExtensionHostOptions['logger']
}

// ============================================================================
// Request Handler Interface
// ============================================================================

/**
 * Interface for request handlers.
 * Each handler is responsible for a set of related methods.
 */
export interface RequestHandler {
  /** The methods this handler can process */
  readonly methods: readonly RequestMethod[]

  /**
   * Handle a request
   * @param ctx Handler context with extension info and services
   * @param method The request method being called
   * @param payload The request payload
   * @returns The result of the request
   */
  handle(ctx: HandlerContext, method: RequestMethod, payload: unknown): Promise<unknown>
}

// ============================================================================
// Handler Registry
// ============================================================================

/**
 * Registry for request handlers.
 * Maps methods to their handlers for efficient lookup.
 */
export class HandlerRegistry {
  private readonly handlers = new Map<RequestMethod, RequestHandler>()

  /**
   * Register a handler for its methods
   * @param handler The handler to register
   */
  register(handler: RequestHandler): void {
    for (const method of handler.methods) {
      if (this.handlers.has(method)) {
        throw new Error(`Handler for method "${method}" already registered`)
      }
      this.handlers.set(method, handler)
    }
  }

  /**
   * Get the handler for a method
   * @param method The method to look up
   * @returns The handler or undefined if not found
   */
  getHandler(method: RequestMethod): RequestHandler | undefined {
    return this.handlers.get(method)
  }

  /**
   * Check if a method has a registered handler
   * @param method The method to check
   */
  hasHandler(method: RequestMethod): boolean {
    return this.handlers.has(method)
  }

  /**
   * Get all registered methods
   */
  getMethods(): RequestMethod[] {
    return Array.from(this.handlers.keys())
  }
}

// ============================================================================
// Abstract Handler Base Classes
// ============================================================================

/**
 * Base class for handlers that need platform-specific implementations.
 * Subclasses in Web/NodeExtensionHost provide concrete implementations.
 */
export abstract class AbstractStorageHandler implements RequestHandler {
  readonly methods = [
    'storage.get',
    'storage.set',
    'storage.delete',
    'storage.keys',
    'storage.getForUser',
    'storage.setForUser',
    'storage.deleteForUser',
    'storage.keysForUser',
  ] as const

  abstract handle(ctx: HandlerContext, method: RequestMethod, payload: unknown): Promise<unknown>
}

/**
 * Base class for network handlers
 */
export abstract class AbstractNetworkHandler implements RequestHandler {
  readonly methods = ['network.fetch', 'network.fetch-stream'] as const

  abstract handle(ctx: HandlerContext, method: RequestMethod, payload: unknown): Promise<unknown>
}

/**
 * Base class for database handlers
 */
export abstract class AbstractDatabaseHandler implements RequestHandler {
  readonly methods = ['database.execute'] as const

  abstract handle(ctx: HandlerContext, method: RequestMethod, payload: unknown): Promise<unknown>
}

// ============================================================================
// Payload Type Helpers
// ============================================================================

/**
 * Safely extract a value from a payload object
 * @param payload The payload object
 * @param key The key to extract
 * @returns The value or undefined
 */
export function getPayloadValue<T>(payload: unknown, key: string): T | undefined {
  if (payload && typeof payload === 'object' && key in payload) {
    return (payload as Record<string, unknown>)[key] as T
  }
  return undefined
}

/**
 * Safely extract a required string value from a payload object
 * @param payload The payload object
 * @param key The key to extract
 * @param errorMessage Custom error message
 * @returns The string value
 * @throws Error if the value is missing or not a string
 */
export function getRequiredString(payload: unknown, key: string, errorMessage?: string): string {
  const value = getPayloadValue<string>(payload, key)
  if (!value || typeof value !== 'string') {
    throw new Error(errorMessage ?? `${key} is required and must be a string`)
  }
  return value
}
