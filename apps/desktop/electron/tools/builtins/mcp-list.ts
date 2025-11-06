import type { BuiltinTool } from '../types.js';

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
      const serverInput = args?.server ?? args?.url;
      const url = await ctx.resolveServer(serverInput);
      if (url.startsWith('local://')) {
        return { tools: ctx.builtinCatalog() };
      }
      return await ctx.listRemoteTools(url);
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  },
};

export default mcpListTool;
