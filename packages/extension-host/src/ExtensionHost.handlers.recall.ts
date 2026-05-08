/**
 * Recall Provider Request Handler
 *
 * Handles recall.registerProvider and recall.unregisterProvider requests from
 * extension workers. On register, stores a proxy handler in the
 * RecallProviderRegistry; the proxy dispatches queries back to the worker via
 * the reverse-RPC channel (recall-query-request / recall-query-response).
 */

import type { RequestMethod, RecallQuery, RecallResult } from '@stina/extension-api'
import type { RequestHandler, HandlerContext } from './ExtensionHost.handlers.js'
import type { RecallProviderRegistry } from '@stina/memory'

/**
 * Callback used by the handler to dispatch a query to a specific worker.
 * The implementation is provided by NodeExtensionHost (mirrors the
 * sendToolExecuteRequest pattern).
 */
export type SendRecallQueryRequest = (
  extensionId: string,
  query: RecallQuery
) => Promise<RecallResult[]>

/**
 * Handler for recall provider registration and unregistration requests.
 */
export class RecallHandler implements RequestHandler {
  readonly methods = ['recall.registerProvider', 'recall.unregisterProvider'] as const

  constructor(
    private readonly registry: RecallProviderRegistry,
    private readonly sendRecallQueryRequest: SendRecallQueryRequest
  ) {}

  /**
   * Handle a recall request from an extension worker.
   */
  async handle(ctx: HandlerContext, method: RequestMethod, payload: unknown): Promise<unknown> {
    switch (method) {
      case 'recall.registerProvider': {
        const check = ctx.extension.permissionChecker.checkRecallRegister()
        if (!check.allowed) {
          throw new Error(check.reason)
        }

        const { extensionId } = ctx

        // Register a proxy handler in the in-process registry. When the registry
        // calls this proxy, it forwards the query back to the worker via the
        // dedicated reverse-RPC channel (not via RequestMethod — different direction).
        this.registry.register(extensionId, (query: RecallQuery): Promise<RecallResult[]> => {
          return this.sendRecallQueryRequest(extensionId, query)
        })

        ctx.logger?.debug('Registered recall provider', { extensionId })
        return undefined
      }

      case 'recall.unregisterProvider': {
        // Host-side: unregister regardless of generation (generation is worker-
        // internal state used to guard stale Disposable.dispose() calls; the
        // host simply removes the entry). No permission check needed for
        // unregister — the extension already had to register first.
        this.registry.unregister(ctx.extensionId)
        ctx.logger?.debug('Unregistered recall provider', { extensionId: ctx.extensionId })
        return undefined
      }

      default:
        throw new Error(`Unknown recall method: ${method}`)
    }
  }
}
