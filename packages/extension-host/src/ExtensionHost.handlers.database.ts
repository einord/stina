/**
 * Database Request Handler
 *
 * Handles database.execute requests.
 * Note: This is an abstract handler - platform-specific implementations
 * must be provided by Web/NodeExtensionHost.
 */

import type { RequestMethod } from '@stina/extension-api'
import type { RequestHandler, HandlerContext } from './ExtensionHost.handlers.js'
import { getPayloadValue, getRequiredString } from './ExtensionHost.handlers.js'

/**
 * Callback for database operations.
 * Provided by the platform-specific extension host.
 */
export interface DatabaseCallback {
  execute(extensionId: string, sql: string, params?: unknown[]): Promise<unknown[]>
}

/**
 * Handler for database requests.
 * Requires platform-specific callback for actual database operations.
 */
export class DatabaseHandler implements RequestHandler {
  readonly methods = ['database.execute'] as const

  constructor(private readonly callback: DatabaseCallback) {}

  /**
   * Handle a database request
   * @param ctx Handler context
   * @param method The database method
   * @param payload Request payload
   */
  async handle(ctx: HandlerContext, method: RequestMethod, payload: unknown): Promise<unknown> {
    switch (method) {
      case 'database.execute': {
        // Check database permission
        const dbCheck = ctx.extension.permissionChecker.checkDatabaseAccess()
        if (!dbCheck.allowed) {
          throw new Error(dbCheck.reason)
        }

        const sql = getRequiredString(payload, 'sql')
        const params = getPayloadValue<unknown[]>(payload, 'params')

        // Validate SQL against extension's allowed tables
        const sqlCheck = ctx.extension.permissionChecker.validateSQL(ctx.extensionId, sql)
        if (!sqlCheck.allowed) {
          throw new Error(sqlCheck.reason)
        }

        return this.callback.execute(ctx.extensionId, sql, params)
      }

      default:
        throw new Error(`Unknown database method: ${method}`)
    }
  }
}
