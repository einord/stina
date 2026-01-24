/**
 * Tool and Action Types
 *
 * Types for tool and action implementations.
 */

import type { ExecutionContext } from './types.context.js'

/**
 * Tool implementation
 */
export interface Tool {
  /** Tool ID (must match manifest) */
  id: string
  /** Display name */
  name: string
  /** Description for Stina */
  description: string
  /** Parameter schema (JSON Schema) */
  parameters?: Record<string, unknown>

  /**
   * Execute the tool
   * @param params Tool parameters from the AI
   * @param context Request-scoped execution context with userId and extension metadata
   */
  execute(params: Record<string, unknown>, context: ExecutionContext): Promise<ToolResult>
}

/**
 * Tool execution result
 */
export interface ToolResult {
  /** Whether the tool succeeded */
  success: boolean
  /** Result data (for Stina to use) */
  data?: unknown
  /** Human-readable message */
  message?: string
  /** Error message if failed */
  error?: string
}

/**
 * Action implementation for UI interactions.
 * Actions are invoked by UI components, not by Stina (AI).
 */
export interface Action {
  /** Action ID (unique within the extension) */
  id: string

  /**
   * Execute the action
   * @param params Parameters from the UI component (with $-values already resolved)
   * @param context Request-scoped execution context with userId and extension metadata
   */
  execute(params: Record<string, unknown>, context: ExecutionContext): Promise<ActionResult>
}

/**
 * Action execution result
 */
export interface ActionResult {
  /** Whether the action succeeded */
  success: boolean
  /** Result data (returned to UI) */
  data?: unknown
  /** Error message if failed */
  error?: string
}
