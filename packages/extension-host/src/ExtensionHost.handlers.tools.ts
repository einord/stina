/**
 * Tools Request Handler
 *
 * Handles tools.list and tools.execute requests.
 */

import type { RequestMethod, ToolDefinition, ToolResult } from '@stina/extension-api'
import type { RequestHandler, HandlerContext } from './ExtensionHost.handlers.js'
import { getPayloadValue } from './ExtensionHost.handlers.js'

export interface ToolsRequestCallbacks {
  listTools: () => ToolDefinition[]
  executeTool: (toolId: string, params: Record<string, unknown>, userId?: string) => Promise<ToolResult>
}

export class ToolsRequestHandler implements RequestHandler {
  readonly methods = ['tools.list', 'tools.execute'] as const

  constructor(private readonly callbacks: ToolsRequestCallbacks) {}

  async handle(ctx: HandlerContext, method: RequestMethod, payload: unknown): Promise<unknown> {
    switch (method) {
      case 'tools.list': {
        const check = ctx.extension.permissionChecker.checkToolListAccess()
        if (!check.allowed) {
          throw new Error(check.reason)
        }
        return this.callbacks.listTools()
      }

      case 'tools.execute': {
        const check = ctx.extension.permissionChecker.checkToolExecuteAccess()
        if (!check.allowed) {
          throw new Error(check.reason)
        }

        const toolId = getPayloadValue<string>(payload, 'toolId')
        if (!toolId || typeof toolId !== 'string') {
          throw new Error('toolId is required')
        }

        const params = getPayloadValue<Record<string, unknown>>(payload, 'params') ?? {}
        if (typeof params !== 'object' || params === null || Array.isArray(params)) {
          throw new Error('params must be an object')
        }

        const userId = getPayloadValue<string>(payload, 'userId')
        if (userId !== undefined && typeof userId !== 'string') {
          throw new Error('userId must be a string')
        }

        return this.callbacks.executeTool(toolId, params, userId)
      }

      default:
        throw new Error(`Unknown tools method: ${method}`)
    }
  }
}
