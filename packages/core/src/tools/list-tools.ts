import { listMCPTools } from '@stina/mcp';
import { listMCPServers, resolveMCPServer } from '@stina/settings';

import type { BaseToolSpec, ToolDefinition } from './base.js';

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
 * Creates the list_tools definition with improved clarity for AI models.
 * This tool should be called FIRST when the user wants to know what's available.
 * @param getBuiltinCatalog Callback returning current builtin tool specs.
 */
export function createListToolsDefinition(getBuiltinCatalog: () => BaseToolSpec[]): ToolDefinition {
  async function handleListTools(args: unknown): Promise<ListToolsSuccess | ListToolsError> {
    const payload = toRecord(args);
    const serverInput = getString(payload, 'server') ?? getString(payload, 'source') ?? null;
    const includeBuiltin = payload.include_builtin !== false && payload.includeBuiltin !== false;
    const includeRemote = payload.include_remote !== false && payload.includeRemote !== false;

    const requested = serverInput;
    const builtin = includeBuiltin ? getBuiltinCatalog() : [];

    const result: ListToolsSuccess = {
      ok: true,
      requested,
      builtin,
      servers: [],
    };

    // Handle specific server request
    if (serverInput) {
      if (['local', 'builtin'].includes(serverInput.toLowerCase())) {
        return result;
      }
      if (!includeRemote) {
        return {
          ok: false,
          error: 'Remote tool discovery disabled by include_remote=false.',
          requested,
          builtin,
        };
      }
      try {
        const url = await resolveMCPServer(serverInput);
        if (url.startsWith('local://')) {
          return result;
        }
        const remote = await listMCPTools(url);
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
          requested,
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
        const remote = await listMCPTools(url);
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
      description:
        '**Refreshes your view of available tools.** You were already shown all tools at session start. ' +
        '**CALL THIS AGAIN when:** ' +
        '1. User asks about a service/capability not in your initial tool list (tools may have been added). ' +
        '2. User explicitly asks "what can you do now?" or "refresh your capabilities". ' +
        '3. You want to verify if a specific integration (Slack, GitHub, etc.) has become available. ' +
        'Returns ALL currently available tools including built-in tools (todos, etc.) AND external MCP server tools. ' +
        'Example: User mentions "Slack" but you didn\'t see Slack tools at session start → Call list_tools to check if Slack was added.',
      parameters: {
        type: 'object',
        properties: {
          server: {
            type: 'string',
            description:
              'Optional: Name of a specific MCP server to inspect (e.g., "slack", "github", "filesystem"). ' +
              'Use "local" or "builtin" to see only built-in tools. ' +
              'Omit this to refresh ALL available tools from all sources (RECOMMENDED).',
          },
          include_builtin: {
            type: 'boolean',
            description:
              'Default true. Set to false if you only want to see MCP server tools, not built-in tools.',
          },
          include_remote: {
            type: 'boolean',
            description:
              'Default true. Set to false to skip querying external MCP servers (only show built-in).',
          },
        },
        additionalProperties: false,
      },
    },
    handler: handleListTools,
  };
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function extractTools(remote: unknown): unknown {
  if (typeof remote === 'object' && remote !== null && 'tools' in remote) {
    return (remote as Record<string, unknown>).tools;
  }
  return remote;
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
