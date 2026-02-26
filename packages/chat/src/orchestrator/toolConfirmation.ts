/**
 * Tool confirmation flow for ChatOrchestrator.
 *
 * Handles the logic for executing tools with optional user confirmation,
 * including confirmation prompt resolution and centralized/local store management.
 */

import type { ToolResult, LocalizedString } from '@stina/extension-api'
import type { ToolCall } from '../types/index.js'
import type { RegisteredTool, ToolExecutionContext } from '../tools/ToolRegistry.js'
import type { PendingConfirmationStore } from '../confirmations/index.js'
import type { OrchestratorEvent } from './types.js'

/**
 * Confirmation response from user
 */
export interface ConfirmationResponse {
  approved: boolean
  denialReason?: string
}

/**
 * Local confirmation store (fallback when centralized store is not available)
 */
export type LocalConfirmationStore = Map<
  string,
  {
    resolve: (response: ConfirmationResponse) => void
    toolCall: ToolCall
  }
>

/**
 * Context needed for tool execution and confirmation
 */
export interface ToolConfirmationContext {
  /** User language for localized prompts */
  userLanguage: string
  /** User ID for execution context */
  userId?: string
  /** Timezone for execution context */
  timezone?: string
  /** Current conversation ID */
  conversationId?: string
  /** Current active queue ID */
  activeQueueId?: string
  /** Get display name for a tool */
  getToolDisplayName?: (toolId: string) => string | undefined
  /** Centralized confirmation store */
  confirmationStore?: PendingConfirmationStore
  /** Local confirmation store (fallback) */
  localConfirmations: LocalConfirmationStore
  /** Event emitter callback */
  emitEvent: (event: OrchestratorEvent) => void
  /** Optional: look up user override for tool confirmation */
  getToolConfirmationOverride?: (extensionId: string, toolId: string) => Promise<boolean | null>
}

/**
 * Resolve the confirmation prompt for a tool call.
 */
export function resolveConfirmationPrompt(
  confirmationPrompt: LocalizedString | undefined,
  toolId: string,
  customMessage: string | undefined,
  userLang: string
): string {
  if (customMessage) return customMessage
  if (!confirmationPrompt) return `Allow ${toolId} to run?`

  if (typeof confirmationPrompt === 'string') {
    return confirmationPrompt
  }

  return (confirmationPrompt as Record<string, string>)[userLang]
    ?? (confirmationPrompt as Record<string, string>)['en']
    ?? `Allow ${toolId} to run?`
}

/**
 * Create a tool executor function that handles confirmation flow.
 * Returns a function compatible with ChatSendMessageOptions.toolExecutor.
 */
export function createToolExecutor(
  ctx: ToolConfirmationContext,
  getTool: (id: string) => RegisteredTool | undefined
): (toolId: string, params: Record<string, unknown>) => Promise<ToolResult> {
  return async (toolId: string, params: Record<string, unknown>): Promise<ToolResult> => {
    const tool = getTool(toolId)
    if (!tool) {
      return { success: false, error: `Tool "${toolId}" not found` }
    }

    // Determine if confirmation is required:
    // 1. Check user override first
    // 2. Fall back to tool's manifest default (requiresConfirmation)
    const override = await ctx.getToolConfirmationOverride?.(tool.extensionId, toolId)
    const needsConfirmation = override ?? tool.requiresConfirmation

    // Check if tool requires confirmation
    if (needsConfirmation) {
      const customMessage = params['_confirmationMessage'] as string | undefined
      const confirmationPrompt = resolveConfirmationPrompt(
        tool.confirmationPrompt,
        toolId,
        customMessage,
        ctx.userLanguage
      )

      // Remove _confirmationMessage from params before execution
      const cleanParams = { ...params }
      delete cleanParams['_confirmationMessage']

      // Create a pending confirmation and wait for user response
      const confirmationResponse = await new Promise<ConfirmationResponse>((resolve) => {
        const toolCall: ToolCall = {
          name: toolId,
          displayName: ctx.getToolDisplayName?.(toolId),
          payload: JSON.stringify(cleanParams),
          result: '',
          confirmationStatus: 'pending' as const,
          confirmationPrompt,
          metadata: { createdAt: new Date().toISOString() },
        }

        // Use centralized confirmation store if available
        if (ctx.confirmationStore && ctx.conversationId) {
          ctx.confirmationStore.register({
            toolCallName: toolId,
            conversationId: ctx.conversationId,
            userId: ctx.userId ?? '',
            resolve,
            toolCall,
          })
        } else {
          // Fallback to local store (backwards compatible)
          ctx.localConfirmations.set(toolId, { resolve, toolCall })
        }

        // Emit event to notify UI about pending confirmation
        ctx.emitEvent({
          type: 'tool-confirmation-pending',
          toolCallName: toolId,
          toolDisplayName: ctx.getToolDisplayName?.(toolId),
          toolPayload: JSON.stringify(cleanParams),
          confirmationPrompt,
          queueId: ctx.activeQueueId,
        })
      })

      // Handle the response
      if (!confirmationResponse.approved) {
        const reason = confirmationResponse.denialReason
          ? `User denied: ${confirmationResponse.denialReason}`
          : 'User denied tool execution'
        return { success: false, error: reason }
      }

      // User approved, execute with clean params
      const executionContext: ToolExecutionContext = {
        timezone: ctx.timezone,
        userId: ctx.userId,
      }
      return tool.execute(cleanParams, executionContext)
    }

    // No confirmation needed, execute directly
    const executionContext: ToolExecutionContext = {
      timezone: ctx.timezone,
      userId: ctx.userId,
    }
    return tool.execute(params, executionContext)
  }
}
