import type { BaseToolSpec, BuiltinTool } from '../types.js';

type ToolServerSummary = { name: string; url?: string; tools?: unknown; error?: string };
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

/**
 * Builtin list_tools implementation used by the Electron-side tool runtime.
 */
const listToolsTool: BuiltinTool = {
  name: 'list_tools',
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
  async run(args, ctx) {
    const payload = toRecord(args);
    const serverInput = getString(payload, 'server') ?? getString(payload, 'source') ?? null;
    const includeBuiltin = payload.include_builtin !== false && payload.includeBuiltin !== false;
    const includeRemote = payload.include_remote !== false && payload.includeRemote !== false;

    const requested = serverInput;
    const builtin = includeBuiltin ? ctx.builtinCatalog() : [];

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
        } satisfies ListToolsError;
      }
      try {
        const url = await ctx.resolveServer(serverInput);
        if (url.startsWith('local://')) {
          return result;
        }
        const remote = await ctx.listRemoteTools(url);
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
        result.servers.push({ name, url, tools: extractTools(remote) });
      } catch (err) {
        result.servers.push({ name, error: toErrorMessage(err) });
      }
    }

    return result;
  },
};

export default listToolsTool;

/**
 * Coerces unknown tool args into a record for easier access.
 */
function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/**
 * Safe string accessor for tool arg records.
 */
function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Picks the tools array off a remote list response when present.
 */
function extractTools(remote: unknown): unknown {
  if (typeof remote === 'object' && remote !== null && 'tools' in remote) {
    return (remote as Record<string, unknown>).tools;
  }
  return remote;
}

/**
 * Formats unknown errors into strings suitable for tool responses.
 */
function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
