import type { ToolResult, LocalizedString } from '@stina/extension-api'

/**
 * Context provided to built-in tools for accessing user settings and other runtime data.
 */
export interface BuiltinToolContext {
  /**
   * Get the user's configured timezone.
   * @returns The IANA timezone string (e.g., "Europe/Stockholm") or undefined if not set
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
   * Execute the tool with the given parameters
   * @param params Parameters for the tool
   * @returns Tool execution result
   */
  execute(params: Record<string, unknown>): Promise<ToolResult>
}

/**
 * Factory function type for creating built-in tools with context.
 */
export type BuiltinToolFactory = (context: BuiltinToolContext) => BuiltinTool
