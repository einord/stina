import type { BuiltinTool } from '../types.js';

/**
 * Builtin mcp_call tool that routes invocations to either remote MCP servers or local handlers.
 */
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
    const payload = toRecord(args);
    const serverInput = getString(payload, 'server') ?? getString(payload, 'url');
    const tool = getString(payload, 'tool') ?? getString(payload, 'name');
    const targs =
      getRecord(payload, 'args') ??
      getRecord(payload, 'arguments') ??
      ({} as Record<string, unknown>);
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
    } catch (err) {
      return { ok: false, error: toErrorMessage(err) };
    }
  },
};

export default mcpCallTool;

/**
 * Coerces arguments into an object shape so properties can be accessed safely.
 */
function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/**
 * Returns a string field from a tool argument object if present.
 */
function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Returns a nested record from the argument payload when the property exists.
 */
function getRecord(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = record[key];
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Formats unexpected errors before returning them to the model.
 */
function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
