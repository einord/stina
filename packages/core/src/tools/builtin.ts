import { callMCPTool, listMCPTools } from '@stina/mcp';
import { listMCPServers, resolveMCPServer } from '@stina/settings';

import { logToolMessage } from '../log.js';

import type { BaseToolSpec, ToolDefinition } from './base.js';
import { formatConsoleLogPayload, logToolInvocation } from './logging.js';

type ToolServerSummary = { name: string; url?: string; tools?: unknown; error?: string };
type ListToolsSuccess = {
  ok: true;
  requested: string | null;
  builtin: BaseToolSpec[] | [];
  servers: ToolServerSummary[];
};
type ListToolsError = {
  ok: false;
  requested: string | null;
  builtin: BaseToolSpec[] | [];
  error: string;
};

type CatalogProvider = () => BaseToolSpec[];

/**
 * Generates the built-in tool definitions, wiring handlers that call into MCP or local helpers.
 * Provide a catalog getter so the list stays in sync with the final tool registry.
 * @param getBuiltinCatalog Callback returning the current builtin tool specs.
 */
export function createBuiltinTools(getBuiltinCatalog: CatalogProvider): ToolDefinition[] {
  /**
   * Handles the console_log tool by formatting payloads and appending log entries.
   */
  async function handleConsoleLog(args: unknown) {
    const payload = toRecord(args);
    const raw = payload.message ?? args;
    const msg = formatConsoleLogPayload(raw);
    logToolMessage(`[tool:console_log] ${msg}`);
    await logToolInvocation('console_log', args);
    return { ok: true };
  }

  /**
   * Handles listing tools on a specific MCP server, including the local builtin catalog fallback.
   */
  async function handleMcpList(args: unknown) {
    await logToolInvocation('mcp_list', args);
    try {
      const payload = toRecord(args);
      const serverInput = getString(payload, 'server') ?? getString(payload, 'url');
      const url = await resolveMCPServer(serverInput);
      if (url.startsWith('local://')) {
        return { tools: getBuiltinCatalog() };
      }
      return await listMCPTools(url);
    } catch (err) {
      return { ok: false, error: toErrorMessage(err) };
    }
  }

  /**
   * Returns the builtin catalog plus, optionally, the discovered tools for configured MCP servers.
   */
  async function handleListTools(args: unknown): Promise<ListToolsSuccess | ListToolsError> {
    await logToolInvocation('list_tools', args);

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
          tools: (remote as { tools?: unknown })?.tools ?? remote,
        });
        return result;
      } catch (err) {
        return { ok: false, error: toErrorMessage(err), requested, builtin };
      }
    }

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
        result.servers.push({ name, url, tools: (remote as { tools?: unknown })?.tools ?? remote });
      } catch (err) {
        result.servers.push({ name, error: toErrorMessage(err) });
      }
    }

    return result;
  }

  /**
   * Proxies a tool invocation to the requested MCP server or to local tool handlers.
   */
  async function handleMcpCall(args: unknown) {
    await logToolInvocation('mcp_call', args);

    const payload = toRecord(args);
    const serverInput = getString(payload, 'server') ?? getString(payload, 'url');
    const tool = getString(payload, 'tool') ?? getString(payload, 'name');
    const toolArgs = (payload.args ?? payload.arguments ?? {}) as unknown;
    if (!tool) return { ok: false, error: 'mcp_call requires { tool }' };
    try {
      const url = await resolveMCPServer(serverInput);
      if (url.startsWith('local://')) {
        if (tool === 'mcp_call') {
          return { ok: false, error: 'Nested mcp_call via local server is not supported.' };
        }
        if (tool === 'console_log') return handleConsoleLog(toolArgs);
        if (tool === 'list_tools') return handleListTools(toolArgs);
        if (tool === 'mcp_list') return handleMcpList(toolArgs);
        return { ok: false, error: `Unknown local tool ${tool}` };
      }
      return await callMCPTool(url, tool, toolArgs);
    } catch (err) {
      return { ok: false, error: toErrorMessage(err) };
    }
  }

  return [
    {
      spec: {
        name: 'console_log',
        description: 'Log a short message to the Stina console for debugging or observability.',
        parameters: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Text to log. Keep it concise and relevant to the current task.',
            },
          },
          required: ['message'],
          additionalProperties: false,
        },
      },
      handler: handleConsoleLog,
    },
    {
      spec: {
        name: 'list_tools',
        description:
          'Return the built-in tools and all tools exposed by configured MCP servers. Useful before choosing which tool to call.',
        parameters: {
          type: 'object',
          properties: {
            server: {
              type: 'string',
              description:
                'Optional MCP server name or URL to inspect. Use "local" to only view built-in tools.',
            },
            include_builtin: {
              type: 'boolean',
              description: 'Set to false to omit built-in tools from the response.',
            },
            include_remote: {
              type: 'boolean',
              description: 'Set to false to skip querying external MCP servers.',
            },
          },
          additionalProperties: false,
        },
      },
      handler: handleListTools,
    },
    {
      spec: {
        name: 'mcp_list',
        description: 'List available tools on a specific MCP server.',
        parameters: {
          type: 'object',
          properties: {
            server: {
              type: 'string',
              description: 'MCP server name or URL. Use "local" to reference built-in tools.',
            },
          },
          required: ['server'],
          additionalProperties: false,
        },
      },
      handler: handleMcpList,
    },
    {
      spec: {
        name: 'mcp_call',
        description: 'Call a tool that is exposed by an MCP server and return its JSON response.',
        parameters: {
          type: 'object',
          properties: {
            server: {
              type: 'string',
              description: 'MCP server name or URL. Use "local" to reference built-in tools.',
            },
            tool: {
              type: 'string',
              description: 'Name of the tool to invoke on the server.',
            },
            args: {
              type: 'object',
              description: 'Arguments to forward to the MCP tool. Defaults to an empty object.',
            },
          },
          required: ['server', 'tool'],
          additionalProperties: false,
        },
      },
      handler: handleMcpCall,
    },
  ];
}

/**
 * Ensures an unknown input is treated as a plain record, falling back to an empty object.
 */
function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/**
 * Extracts a string property from a record when it exists and is properly typed.
 */
function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Normalizes thrown errors into safe, user-readable strings.
 */
function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
