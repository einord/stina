import type { ToolResult, LocalizedString } from '@stina/extension-api'
import type { ToolExecutionContext } from '@stina/chat'

/**
 * Context provided to built-in tools at registration time.
 * Contains callbacks for accessing user settings that may be needed during execution.
 * @deprecated Prefer using ToolExecutionContext passed to execute() for user-specific data
 */
export interface BuiltinToolContext {
  /**
   * Get the user's configured timezone.
   * @returns The IANA timezone string (e.g., "Europe/Stockholm") or undefined if not set
   * @deprecated Use executionContext.timezone in execute() instead
   */
  getTimezone: () => Promise<string | undefined>
}

/**
 * Interface for built-in tools.
 * Similar to RegisteredTool but without extensionId requirement at definition time.
 */
export interface BuiltinTool {
  /** Tool ID (unique identifier) */
  id: string
  /** Display name - can be a simple string or localized strings */
  name: LocalizedString
  /** Description for the AI - should explain when and how to use the tool */
  description: LocalizedString
  /** Parameter schema (JSON Schema) */
  parameters?: Record<string, unknown>
  /**
   * Whether this tool requires user confirmation before execution.
   * Defaults to true if not specified.
   */
  requiresConfirmation?: boolean
  /**
   * Optional custom confirmation prompt to show the user.
   * Only used when confirmation is required.
   */
  confirmationPrompt?: LocalizedString
  /**
   * Execute the tool with the given parameters
   * @param params Parameters for the tool
   * @param executionContext Optional context with user-specific runtime data (preferred)
   * @returns Tool execution result
   */
  execute(params: Record<string, unknown>, executionContext?: ToolExecutionContext): Promise<ToolResult>
}

/**
 * Factory function type for creating built-in tools with context.
 */
export type BuiltinToolFactory = (context: BuiltinToolContext) => BuiltinTool

// Re-export ToolExecutionContext for convenience
export type { ToolExecutionContext } from '@stina/chat'
