import { callMCPTool } from '@stina/mcp';
import { resolveMCPServer } from '@stina/settings';

import type { ToolDefinition, ToolHandler } from './base.js';

/**
 * Creates the mcp_call definition for proxying tool invocations to MCP servers.
 * This is the bridge between Stina's built-in tools and external MCP tools.
 * @param localHandlers Map of local tool handlers for "local://" server requests.
 */
export function createMcpCallDefinition(localHandlers: Map<string, ToolHandler>): ToolDefinition {
  async function handleMcpCall(args: unknown) {
    const payload = toRecord(args);
    const serverInput = getString(payload, 'server') ?? getString(payload, 'url');
    const tool = getString(payload, 'tool') ?? getString(payload, 'name');
    const toolArgs = (payload.args ?? payload.arguments ?? {}) as unknown;

    if (!tool) {
      return { ok: false, error: 'mcp_call requires { tool: "tool_name" }' };
    }

    try {
      const url = await resolveMCPServer(serverInput);

      // Handle local tool invocation
      if (url.startsWith('local://')) {
        if (tool === 'mcp_call') {
          return { ok: false, error: 'Nested mcp_call via local server is not supported.' };
        }
        const handler = localHandlers.get(tool);
        if (!handler) {
          return { ok: false, error: `Unknown local tool: ${tool}` };
        }
        return handler(toolArgs);
      }

      // Invoke remote MCP tool
      const safeArgs = normalizeJsonValue(toolArgs);
      return await callMCPTool(url, tool, safeArgs);
    } catch (err) {
      return { ok: false, error: toErrorMessage(err) };
    }
  }

  return {
    spec: {
      name: 'mcp_call',
      description:
        '**USE THIS to invoke tools from external MCP servers** after discovering them with list_tools. ' +
        'WORKFLOW: 1) Call list_tools to see available tools. 2) Call mcp_call with server name and tool name. ' +
        'EXAMPLES: ' +
        '• Slack message: mcp_call(server="slack", tool="slack_chat_postMessage", args={channel:"C123", text:"Hi"}) ' +
        '• Read file: mcp_call(server="filesystem", tool="read_file", args={path:"/home/file.txt"}) ' +
        '• GitHub search: mcp_call(server="github", tool="search_repositories", args={query:"stina"}) ' +
        'Always check list_tools output for exact server names, tool names, and required parameters.',
      parameters: {
        type: 'object',
        properties: {
          server: {
            type: 'string',
            description:
              'Name of the MCP server providing the tool (e.g., "slack", "github", "filesystem"). ' +
              'Get this from list_tools output. Each tool in list_tools shows which server it belongs to. ' +
              'Use "local" to call built-in Stina tools (though calling them directly is preferred).',
          },
          tool: {
            type: 'string',
            description:
              'Exact name of the tool to invoke (e.g., "slack_chat_postMessage", "read_file"). ' +
              'Must match the tool name exactly as shown in list_tools output.',
          },
          args: {
            type: 'object',
            description:
              "Arguments object for the tool. Must match the tool's parameter schema from list_tools. " +
              'Example for slack_chat_postMessage: {channel: "C12345", text: "Hello"} ' +
              'Example for read_file: {path: "/path/to/file.txt"} ' +
              'Defaults to {} if the tool takes no arguments.',
          },
        },
        required: ['server', 'tool'],
        additionalProperties: false,
      },
    },
    handler: handleMcpCall,
  };
}

/**
 * Ensures toolArgs conforms to JSON value shape (primitive | object | array).
 */
function normalizeJsonValue(toolArgs: unknown): import('@stina/mcp').Json {
  if (toolArgs == null) return {};
  if (
    typeof toolArgs === 'string' ||
    typeof toolArgs === 'number' ||
    typeof toolArgs === 'boolean'
  ) {
    return toolArgs;
  }
  if (Array.isArray(toolArgs)) return toolArgs;
  if (typeof toolArgs === 'object') return toolArgs as Record<string, import('@stina/mcp').Json>;
  return {};
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
