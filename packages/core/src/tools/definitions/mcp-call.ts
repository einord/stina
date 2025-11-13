import { callMCPTool } from '@stina/mcp';
import { buildMcpAuthHeaders, resolveMCPServer, resolveMCPServerConfig } from '@stina/settings';

import type { ToolDefinition } from '../base.js';

/**
 * Creates the mcp_call tool definition.
 * This tool delegates execution to tools on remote MCP servers or local built-in tools.
 * @param runLocalTool Callback to execute a local built-in tool by name.
 */
export function createMcpCallDefinition(
  runLocalTool: (name: string, args: unknown) => Promise<unknown>,
): ToolDefinition {
  async function handleMcpCall(args: unknown) {
    const payload = toRecord(args);
    const serverInput = getString(payload, 'server') ?? getString(payload, 'url');
    const tool = getString(payload, 'tool') ?? getString(payload, 'name');
    const toolArgs = (payload.args ?? payload.arguments ?? {}) as unknown;

    if (!tool) {
      return { ok: false, error: 'mcp_call requires { tool } parameter' };
    }

    try {
      const url = await resolveMCPServer(serverInput);

      // Handle local tool execution
      if (url.startsWith('local://')) {
        // Prevent infinite recursion
        if (tool === 'mcp_call') {
          return { ok: false, error: 'Nested mcp_call via local server is not supported.' };
        }
        return await runLocalTool(tool, toolArgs);
      }

      // Convert toolArgs to JSON-compatible format
      const safeArgs = toJsonValue(toolArgs);
      const headers = await getServerHeaders(serverInput ?? undefined, url);
      return await callMCPTool(url, tool, safeArgs, headers ? { headers } : undefined);
    } catch (err) {
      return { ok: false, error: toErrorMessage(err) };
    }
  }

  return {
    spec: {
      name: 'mcp_call',
      description: [
        '**Use this only when you must call an MCP tool via a specific server/channel.**',
        '',
        'This is a proxy tool that forwards your request to a specific MCP server.',
        '',
        'When to use:',
        '- You explicitly need to target a specific MCP server or override the default routing.',
        '- The user asks you to call `mcp_call` or to hit a server by name.',
        '- Automated flows that are not exposed as first-class tools yet.',
        '',
        'When NOT to use:',
        '- For built-in tools (todo_list, todo_add, etc.) - call them directly instead.',
        '- For MCP tools that already appear in your available tool list — call them directly by name.',
        "- If you're unsure which server has the tool - call list_tools first.",
        '',
        'Example flow:',
        '1. User: "Search my documents for \'budget\'"',
        '2. You: Call list_tools to find which server has search capability',
        '3. You: Call mcp_call with server="filesystem", tool="search", args={query: "budget"}',
      ].join('\n'),
      parameters: {
        type: 'object',
        properties: {
          server: {
            type: 'string',
            description:
              'MCP server name or URL. Use "local" for built-in tools (though calling built-ins directly is preferred).',
          },
          tool: {
            type: 'string',
            description: 'Name of the tool to invoke on that server.',
          },
          args: {
            type: 'object',
            description:
              "Arguments to pass to the tool. Must match the tool's expected parameter schema. Defaults to empty object {}.",
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
 * Ensures an unknown input is treated as a plain record.
 */
function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/**
 * Extracts a string property from a record.
 */
function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Converts unknown tool arguments to JSON-compatible values.
 */
function toJsonValue(toolArgs: unknown): import('@stina/mcp').Json {
  if (toolArgs == null) return {};
  if (
    typeof toolArgs === 'string' ||
    typeof toolArgs === 'number' ||
    typeof toolArgs === 'boolean'
  ) {
    return toolArgs;
  }
  if (Array.isArray(toolArgs)) return toolArgs;
  if (typeof toolArgs === 'object') {
    return toolArgs as Record<string, import('@stina/mcp').Json>;
  }
  return {};
}

/**
 * Normalizes errors into user-readable strings.
 */
function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function getServerHeaders(
  serverInput: string | undefined,
  url: string,
): Promise<Record<string, string> | undefined> {
  const name = serverInput && !/^wss?:/i.test(serverInput) ? serverInput : undefined;
  if (!name) return undefined;
  try {
    const server = await resolveMCPServerConfig(name);
    return buildMcpAuthHeaders(server);
  } catch {
    return undefined;
  }
}
