import type { BaseToolSpec, BuiltinTool } from '../types.js';

type ToolServerSummary = { name: string; url?: string; tools?: any; error?: string };
export type ListToolsSuccess = {
  ok: true;
  requested: string | null;
  builtin: BaseToolSpec[] | [];
  servers: ToolServerSummary[];
};
export type ListToolsError = {
  ok: false;
  requested: string | null;
  builtin: BaseToolSpec[] | [];
  error: string;
};

const listToolsTool: BuiltinTool = {
  name: 'list_tools',
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
  async run(args, ctx) {
    const serverInput = args?.server ?? args?.source ?? null;
    const includeBuiltin = args?.include_builtin !== false && args?.includeBuiltin !== false;
    const includeRemote = args?.include_remote !== false && args?.includeRemote !== false;

    const requested = serverInput ? String(serverInput) : null;
    const builtin = includeBuiltin ? ctx.builtinCatalog() : [];

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
        } satisfies ListToolsError;
      }
      try {
        const url = await ctx.resolveServer(serverInput);
        if (url.startsWith('local://')) {
          return result;
        }
        const remote = await ctx.listRemoteTools(url);
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
        } satisfies ListToolsError;
      }
    }

    if (!includeRemote) {
      return result;
    }

    const conf = await ctx.listServers().catch(() => ({ servers: [], defaultServer: undefined }));
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
        const url = await ctx.resolveServer(name);
        if (url.startsWith('local://')) continue;
        const remote = await ctx.listRemoteTools(url);
        result.servers.push({ name, url, tools: remote?.tools ?? remote });
      } catch (err: any) {
        result.servers.push({ name, error: err?.message ?? String(err) });
      }
    }

    return result;
  },
};

export default listToolsTool;
