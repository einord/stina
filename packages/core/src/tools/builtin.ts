import { callMCPTool, listMCPTools } from '@stina/mcp';
import { listMCPServers, resolveMCPServer } from '@stina/settings';

import { logToolMessage } from '../log.js';
import type { BaseToolSpec, ToolDefinition } from './base.js';
import { formatConsoleLogPayload, logToolInvocation } from './logging.js';

type ToolServerSummary = { name: string; url?: string; tools?: any; error?: string };
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

export function createBuiltinTools(getBuiltinCatalog: CatalogProvider): ToolDefinition[] {
  async function handleConsoleLog(args: any) {
    const raw = args?.message ?? args;
    const msg = formatConsoleLogPayload(raw);
    logToolMessage(`[tool:console_log] ${msg}`);
    await logToolInvocation('console_log', args);
    return { ok: true };
  }

  async function handleMcpList(args: any) {
    await logToolInvocation('mcp_list', args);
    try {
      const serverInput = args?.server ?? args?.url;
      const url = await resolveMCPServer(serverInput);
      if (url.startsWith('local://')) {
        return { tools: getBuiltinCatalog() };
      }
      return await listMCPTools(url);
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  }

  async function handleListTools(args: any): Promise<ListToolsSuccess | ListToolsError> {
    await logToolInvocation('list_tools', args);

    const serverInput = args?.server ?? args?.source ?? null;
    const includeBuiltin = args?.include_builtin !== false && args?.includeBuiltin !== false;
    const includeRemote = args?.include_remote !== false && args?.includeRemote !== false;

    const requested = serverInput ? String(serverInput) : null;
    const builtin = includeBuiltin ? getBuiltinCatalog() : [];

    const result: ListToolsSuccess = {
      ok: true,
      requested,
      builtin,
      servers: [],
    };

    if (serverInput) {
      if (typeof serverInput === 'string' && ['local', 'builtin'].includes(serverInput.toLowerCase())) {
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
          name: typeof serverInput === 'string' ? serverInput : 'default',
          url,
          tools: remote?.tools ?? remote,
        });
        return result;
      } catch (err: any) {
        return {
          ok: false,
          error: err?.message ?? String(err),
          requested,
          builtin,
        };
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
        result.servers.push({ name, url, tools: remote?.tools ?? remote });
      } catch (err: any) {
        result.servers.push({ name, error: err?.message ?? String(err) });
      }
    }

    return result;
  }

  async function handleMcpCall(args: any) {
    await logToolInvocation('mcp_call', args);

    const serverInput = args?.server ?? args?.url;
    const tool = args?.tool ?? args?.name;
    const targs = args?.args ?? args?.arguments ?? {};
    if (!tool) return { ok: false, error: 'mcp_call requires { tool }' };
    try {
      const url = await resolveMCPServer(serverInput);
      if (url.startsWith('local://')) {
        if (tool === 'mcp_call') {
          return { ok: false, error: 'Nested mcp_call via local server is not supported.' };
        }
        if (tool === 'console_log') return handleConsoleLog(targs);
        if (tool === 'list_tools') return handleListTools(targs);
        if (tool === 'mcp_list') return handleMcpList(targs);
        return { ok: false, error: `Unknown local tool ${tool}` };
      }
      return await callMCPTool(url, tool, targs);
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) };
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
          'Return the built-in tools and any tools exposed by configured MCP servers. Useful before choosing which tool to call.',
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
