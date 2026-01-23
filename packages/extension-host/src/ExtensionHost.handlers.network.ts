/**
 * Network Request Handler
 *
 * Handles network.fetch and network.fetch-stream requests.
 * Note: This is an abstract handler - platform-specific implementations
 * must be provided by Web/NodeExtensionHost.
 */

import type { RequestMethod } from '@stina/extension-api'
import type { RequestHandler, HandlerContext } from './ExtensionHost.handlers.js'
import { getPayloadValue, getRequiredString } from './ExtensionHost.handlers.js'

/**
 * Fetch response structure
 */
export interface FetchResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
}

/**
 * Callbacks for network operations.
 * These are provided by the platform-specific extension host.
 */
export interface NetworkCallbacks {
  /** Perform a regular fetch request */
  fetch(url: string, options?: RequestInit): Promise<FetchResponse>
  /** Start a streaming fetch request */
  fetchStream(extensionId: string, requestId: string, url: string, options?: RequestInit): Promise<void>
}

/**
 * Handler for network requests.
 * Requires platform-specific callbacks for actual network operations.
 */
export class NetworkHandler implements RequestHandler {
  readonly methods = ['network.fetch', 'network.fetch-stream'] as const

  constructor(private readonly callbacks: NetworkCallbacks) {}

  /**
   * Handle a network request
   * @param ctx Handler context
   * @param method The network method
   * @param payload Request payload
   */
  async handle(ctx: HandlerContext, method: RequestMethod, payload: unknown): Promise<unknown> {
    switch (method) {
      case 'network.fetch': {
        const url = getRequiredString(payload, 'url')
        const options = getPayloadValue<RequestInit>(payload, 'options')

        // Debug log
        ctx.logger?.debug('Network fetch request', {
          extensionId: ctx.extensionId,
          url,
          permissions: ctx.extension.permissionChecker.getPermissions(),
        })

        // Check permission
        const check = ctx.extension.permissionChecker.checkNetworkAccess(url)
        if (!check.allowed) {
          ctx.logger?.error('Network access denied', {
            extensionId: ctx.extensionId,
            url,
            reason: check.reason,
            permissions: ctx.extension.permissionChecker.getPermissions(),
          })
          throw new Error(check.reason)
        }

        return this.callbacks.fetch(url, options)
      }

      case 'network.fetch-stream': {
        const url = getRequiredString(payload, 'url')
        const options = getPayloadValue<RequestInit>(payload, 'options')
        const requestId = getRequiredString(payload, 'requestId')

        ctx.logger?.debug('Network fetch-stream request', {
          extensionId: ctx.extensionId,
          url,
          requestId,
        })

        // Check permission
        const check = ctx.extension.permissionChecker.checkNetworkAccess(url)
        if (!check.allowed) {
          ctx.logger?.error('Network access denied', {
            extensionId: ctx.extensionId,
            url,
            reason: check.reason,
          })
          throw new Error(check.reason)
        }

        // Start streaming in background, return immediately
        this.callbacks.fetchStream(ctx.extensionId, requestId, url, options)
        return { status: 'streaming' }
      }

      default:
        throw new Error(`Unknown network method: ${method}`)
    }
  }
}
