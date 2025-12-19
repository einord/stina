/**
 * MCP Tool Caller - Handles calling MCP tools via correct transport
 *
 * Separated from tools.ts to avoid circular imports when tool definitions
 * need to call MCP tools.
 */

import {
  callMCPTool,
  callStdioMCPTool,
} from '@stina/mcp';
import type { Json } from '@stina/mcp';
import {
  buildMcpAuthHeaders,
  resolveMCPServerConfig,
} from '@stina/settings';

/**
 * Calls an MCP tool by server name, automatically resolving the correct transport.
 * This is the recommended way to call MCP tools from within Stina's tool handlers.
 */
export async function callMCPToolByName(
  serverName: string,
  toolName: string,
  args: unknown,
): Promise<unknown> {
  const server = await resolveMCPServerConfig(serverName);
  if (!server) {
    throw new Error(`MCP server "${serverName}" not found in configuration`);
  }

  const jsonArgs = toJsonValue(args);

  if (server.type === 'stdio') {
    if (!server.command) {
      throw new Error(`MCP server ${serverName} missing command for stdio transport`);
    }
    return callStdioMCPTool(server.command, toolName, jsonArgs, server.args, server.env);
  }

  // Default: websocket
  if (!server.url) {
    throw new Error(`MCP server ${serverName} missing URL for websocket transport`);
  }
  const headers = buildMcpAuthHeaders(server);
  return callMCPTool(server.url, toolName, jsonArgs, headers ? { headers } : undefined);
}

/**
 * Normalizes arbitrary tool arguments into MCP-compatible JSON structures.
 */
function toJsonValue(value: unknown): Json {
  if (value == null) return {};
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) return value as Json;
  if (typeof value === 'object') {
    return value as Record<string, Json>;
  }
  return {};
}
