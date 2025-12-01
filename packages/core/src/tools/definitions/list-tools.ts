import { listMCPTools, listStdioMCPTools } from '@stina/mcp';
import {
  buildMcpAuthHeaders,
  listMCPServers,
  resolveMCPServer,
  resolveMCPServerConfig,
} from '@stina/settings';

import type { BaseToolSpec, ToolDefinition } from '../infrastructure/base.js';

type ToolServerSummary = { name: string; url?: string; tools?: unknown; error?: string };

type ListToolsSuccess = {
  ok: true;
  requested: string | null;
  builtin: BaseToolSpec[];
  servers: ToolServerSummary[];
};

type ListToolsError = {
  ok: false;
  requested: string | null;
  builtin: BaseToolSpec[];
  error: string;
};

/**
 * Creates the list_tools tool definition.
 * This tool should be called FIRST when discovering what capabilities are available.
 * @param getBuiltinCatalog Callback that returns the current builtin tool catalog.
 */
export function createListToolsDefinition(getBuiltinCatalog: () => BaseToolSpec[]): ToolDefinition {
  async function handleListTools(args: unknown): Promise<ListToolsSuccess | ListToolsError> {
    const payload = toRecord(args);
    const serverInput = getString(payload, 'server') ?? null;
    const includeBuiltin = payload.include_builtin !== false && payload.includeBuiltin !== false;
    const includeRemote = payload.include_remote !== false && payload.includeRemote !== false;

    const builtin = includeBuiltin ? getBuiltinCatalog() : [];

    const result: ListToolsSuccess = {
      ok: true,
      requested: serverInput,
      builtin,
      servers: [],
    };

    // If specific server requested
    if (serverInput) {
      if (['local', 'builtin'].includes(serverInput.toLowerCase())) {
        return result;
      }

      if (!includeRemote) {
        return {
          ok: false,
          error: 'Remote tool discovery disabled by include_remote=false.',
          requested: serverInput,
          builtin,
        };
      }

      try {
        const url = await resolveMCPServer(serverInput);
        if (url.startsWith('local://')) {
          return result;
        }

        const headers = await getServerHeaders(serverInput);
        const remote = await fetchToolsFromUrl(url, headers);
        result.servers.push({
          name: serverInput,
          url,
          tools: extractTools(remote),
        });
        return result;
      } catch (err) {
        return {
          ok: false,
          error: toErrorMessage(err),
          requested: serverInput,
          builtin,
        };
      }
    }

    // List all configured servers
    if (!includeRemote) {
      return result;
    }

    const conf = await listMCPServers().catch(() => ({ servers: [], defaultServer: undefined }));
    const seen = new Set<string>();
    const queue: string[] = [];

    if (conf.defaultServer) queue.push(conf.defaultServer);
    for (const srv of conf.servers ?? []) {
      queue.push(srv.name);
    }

    for (const name of queue) {
      if (!name || seen.has(name)) continue;
      seen.add(name);

      try {
        const url = await resolveMCPServer(name);
        if (url.startsWith('local://')) continue;

        const headers = await getServerHeaders(name).catch(() => undefined);
        const remote = await fetchToolsFromUrl(url, headers);
        result.servers.push({ name, url, tools: extractTools(remote) });
      } catch (err) {
        result.servers.push({ name, error: toErrorMessage(err) });
      }
    }

    return result;
  }

  return {
    spec: {
      name: 'list_tools',
      description: `**Call this FIRST when the user asks about available tools or capabilities.**

Returns all tools you can use, including:
- Built-in tools (todo management, etc.)
- External MCP server tools (if configured). You can invoke these remote tools directly by name once you discover them.

Use cases:
- User asks "what can you do?" → call list_tools
- User asks "what tools are available?" → call list_tools
- Before using an unknown tool → call list_tools to verify it exists

Do NOT use this tool repeatedly in the same conversation unless the user explicitly asks for it again.`,
      parameters: {
        type: 'object',
        properties: {
          server: {
            type: 'string',
            description:
              'Optional: Specific MCP server name or URL to inspect. Use "local" or "builtin" to see only built-in tools. Omit to see all available tools.',
          },
          include_builtin: {
            type: 'boolean',
            description: 'Set to false to exclude built-in tools from results. Default: true',
          },
          include_remote: {
            type: 'boolean',
            description: 'Set to false to skip querying external MCP servers. Default: true',
          },
        },
        additionalProperties: false,
      },
    },
    handler: handleListTools,
  };
}

/**
 * Fetches tools from a given URL, supporting both WebSocket and stdio MCP servers.
 */
async function fetchToolsFromUrl(url: string, headers?: Record<string, string>): Promise<unknown> {
  // Check if it's a stdio command (starts with command:// or similar)
  if (
    url.includes('://') &&
    !url.startsWith('http://') &&
    !url.startsWith('https://') &&
    !url.startsWith('ws://') &&
    !url.startsWith('wss://')
  ) {
    // Assume it's a stdio server command
    const command = url.split('://')[1];
    return await listStdioMCPTools(command);
  }

  return await listMCPTools(url, headers ? { headers } : undefined);
}

async function getServerHeaders(name: string): Promise<Record<string, string> | undefined> {
  try {
    const server = await resolveMCPServerConfig(name);
    return buildMcpAuthHeaders(server);
  } catch {
    return undefined;
  }
}

/**
 * Extracts the tools array from an MCP response if present.
 */
function extractTools(remote: unknown): unknown {
  if (typeof remote === 'object' && remote !== null && 'tools' in remote) {
    return (remote as { tools?: unknown }).tools;
  }
  return remote;
}

/**
 * Ensures an unknown input is treated as a plain record.
 */
function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/**
 * Extracts a string property from a record when it exists.
 */
function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Normalizes errors into user-readable strings.
 */
function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
