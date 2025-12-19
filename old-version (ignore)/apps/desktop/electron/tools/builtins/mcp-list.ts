import type { BuiltinTool } from '../types.js';

/**
 * Builtin mcp_list helper that proxies tool discovery to a specific server.
 */
const mcpListTool: BuiltinTool = {
  name: 'mcp_list',
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
  async run(args, ctx) {
    try {
      const payload = toRecord(args);
      const serverInput = getString(payload, 'server') ?? getString(payload, 'url');
      const url = await ctx.resolveServer(serverInput);
      if (url.startsWith('local://')) {
        return { tools: ctx.builtinCatalog() };
      }
      return await ctx.listRemoteTools(url);
    } catch (err) {
      return { ok: false, error: toErrorMessage(err) };
    }
  },
};

export default mcpListTool;

/**
 * Coerces unknown args into objects so property lookups are safe.
 */
function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/**
 * Reads a string field from an argument object if present.
 */
function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Converts unknown errors to user-readable strings.
 */
function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
