/**
 * Chat Request Handler
 *
 * Handles chat.appendInstruction requests.
 */

import type { RequestMethod } from '@stina/extension-api'
import type { RequestHandler, HandlerContext } from './ExtensionHost.handlers.js'
import { getPayloadValue } from './ExtensionHost.handlers.js'

/**
 * Handler for chat-related requests
 */
export class ChatHandler implements RequestHandler {
  readonly methods = ['chat.appendInstruction'] as const

  /**
   * Handle a chat request
   * @param ctx Handler context
   * @param method The chat method
   * @param payload Request payload
   */
  async handle(ctx: HandlerContext, method: RequestMethod, payload: unknown): Promise<unknown> {
    switch (method) {
      case 'chat.appendInstruction': {
        const check = ctx.extension.permissionChecker.checkChatMessageWrite()
        if (!check.allowed) {
          throw new Error(check.reason)
        }

        if (!ctx.options.chat) {
          throw new Error('Chat bridge not configured')
        }

        const text = getPayloadValue<string>(payload, 'text')
        const conversationId = getPayloadValue<string>(payload, 'conversationId')
        const userId = getPayloadValue<string>(payload, 'userId')

        if (!text || typeof text !== 'string') {
          throw new Error('text is required')
        }
        if (conversationId !== undefined && typeof conversationId !== 'string') {
          throw new Error('conversationId must be a string')
        }
        if (userId !== undefined && typeof userId !== 'string') {
          throw new Error('userId must be a string')
        }

        await ctx.options.chat.appendInstruction(ctx.extensionId, {
          text,
          conversationId,
          userId,
        })

        return undefined
      }

      default:
        throw new Error(`Unknown chat method: ${method}`)
    }
  }
}
