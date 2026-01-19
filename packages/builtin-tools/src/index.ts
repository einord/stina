import type { ToolRegistry, RegisteredTool, ToolExecutionContext } from '@stina/chat'
import type { BuiltinTool, BuiltinToolContext, BuiltinToolFactory } from './types.js'
import { createDateTimeTool } from './tools/index.js'

/** Extension ID used for all built-in tools */
export const BUILTIN_EXTENSION_ID = 'stina.builtin'

/** All built-in tool factories */
const builtinToolFactories: BuiltinToolFactory[] = [createDateTimeTool]

/**
 * Convert a BuiltinTool to RegisteredTool format.
 * The execute function is wrapped to pass execution context through.
 */
function toRegisteredTool(tool: BuiltinTool): RegisteredTool {
  return {
    id: tool.id,
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    extensionId: BUILTIN_EXTENSION_ID,
    execute: (params: Record<string, unknown>, context?: ToolExecutionContext) =>
      tool.execute(params, context),
  }
}

/**
 * Options for registering built-in tools
 */
export interface RegisterBuiltinToolsOptions {
  /**
   * Get the user's configured timezone.
   * @returns The IANA timezone string (e.g., "Europe/Stockholm") or undefined if not set
   */
  getTimezone: () => Promise<string | undefined>
}

/**
 * Register all built-in tools with the tool registry.
 * Should be called during app initialization, before extension loading.
 *
 * @param registry The ToolRegistry instance to register tools with
 * @param options Options including callbacks for accessing user settings
 * @returns Number of tools registered
 */
export function registerBuiltinTools(registry: ToolRegistry, options: RegisterBuiltinToolsOptions): number {
  const context: BuiltinToolContext = {
    getTimezone: options.getTimezone,
  }

  let count = 0
  for (let i = 0; i < builtinToolFactories.length; i++) {
    try {
      const tool = builtinToolFactories[i]!(context)
      registry.register(toRegisteredTool(tool))
      count++
    } catch (error) {
      // Tool might already be registered - skip, but log unexpected errors for debugging
      console.error(`Failed to register built-in tool at index ${i}`, error)
    }
  }
  return count
}

/**
 * Get built-in tools (for testing/inspection)
 * @param context The context to use for creating tools
 */
export function getBuiltinTools(context: BuiltinToolContext): BuiltinTool[] {
  return builtinToolFactories.map((factory) => factory(context))
}

// Re-export types and individual tool factories
export type { BuiltinTool, BuiltinToolContext, BuiltinToolFactory } from './types.js'
export { createDateTimeTool } from './tools/index.js'
