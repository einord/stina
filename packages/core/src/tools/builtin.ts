import type { BaseToolSpec, ToolDefinition, ToolHandler } from './base.js';
import { createListToolsDefinition } from './list-tools.js';
import { createMcpCallDefinition } from './mcp-call.js';

type CatalogProvider = () => BaseToolSpec[];

/**
 * Generates the built-in MCP tool definitions with improved clarity for AI models.
 * Tools now have actionable descriptions that explain WHEN and HOW to use them.
 * @param getBuiltinCatalog Callback returning the current builtin tool specs.
 * @param localHandlers Map of all local tool handlers for mcp_call routing.
 */
export function createBuiltinTools(
  getBuiltinCatalog: CatalogProvider,
  localHandlers: Map<string, ToolHandler>,
): ToolDefinition[] {
  // Create tool definitions using the new modular approach
  const listTools = createListToolsDefinition(getBuiltinCatalog);
  const mcpCall = createMcpCallDefinition(localHandlers);

  return [
    listTools,
    mcpCall,
    // Note: console_log is disabled by default (model overuses it)
    // Note: mcp_list removed - use list_tools with server parameter instead
  ];
}
