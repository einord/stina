import type { BuiltinTool } from '../types.js';

const mcpCallTool: BuiltinTool = {
  name: 'mcp_call',
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
  async run(args, ctx) {
    const serverInput = args?.server ?? args?.url;
    const tool = args?.tool ?? args?.name;
    const targs = args?.args ?? args?.arguments ?? {};
    if (!tool) return { ok: false, error: 'mcp_call requires { tool }' };

    try {
      const url = await ctx.resolveServer(serverInput);
      if (url.startsWith('local://')) {
        if (tool === 'mcp_call') {
          return { ok: false, error: 'Nested mcp_call via local server is not supported.' };
        }
        return await ctx.runBuiltin(tool, targs);
      }
      return await ctx.callRemoteTool(url, tool, targs);
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  },
};

export default mcpCallTool;
