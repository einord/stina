import { callMCPTool, listMCPTools } from '@stina/mcp';
import { resolveMCPServer } from '@stina/settings';

export const toolSpecs = {
  openai: [
    {
      type: 'function',
      function: {
        name: 'console_log',
        description: 'Log a message to the Stina console for debugging/observability.',
        parameters: {
          type: 'object',
          properties: { message: { type: 'string' } },
          required: ['message'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'mcp_call',
        description: 'Call a tool on an external MCP server over WebSocket.',
        parameters: {
          type: 'object',
          properties: {
            server: { type: 'string' },
            tool: { type: 'string' },
            args: { type: 'object' },
          },
          required: ['server', 'tool'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'mcp_list',
        description: 'List available tools on an external MCP server.',
        parameters: {
          type: 'object',
          properties: { server: { type: 'string' } },
          required: ['server'],
        },
      },
    },
  ],
  anthropic: [
    {
      name: 'console_log',
      description: 'Log a message to the Stina console for debugging/observability.',
      input_schema: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      },
    },
  ],
  gemini: [
    {
      functionDeclarations: [
        {
          name: 'console_log',
          description: 'Log a message to the Stina console for debugging/observability.',
          parameters: {
            type: 'OBJECT',
            properties: { message: { type: 'STRING' } },
            required: ['message'],
          },
        },
      ],
    },
  ],
  ollama: [
    {
      type: 'function',
      function: {
        name: 'console_log',
        description: 'Log a message to the Stina console for debugging/observability.',
        parameters: {
          type: 'object',
          properties: { message: { type: 'string' } },
          required: ['message'],
        },
      },
    },
  ],
} as const;

export async function runTool(name: string, args: any) {
  if (name === 'console_log') {
    const msg = typeof args?.message === 'string' ? args.message : String(args);
    console.log('[tool:console_log]', msg);
    return { ok: true };
  }
  if (name === 'mcp_call') {
    const serverInput = args?.server ?? args?.url;
    const tool = args?.tool ?? args?.name;
    const targs = args?.args ?? args?.arguments ?? {};
    if (!tool) return { ok: false, error: 'mcp_call requires { tool }' };
    const url = await resolveMCPServer(serverInput);
    if (url.startsWith('local://')) {
      if (tool === 'console_log') {
        const msg =
          typeof targs?.message === 'string' ? targs.message : String(targs?.message ?? '');
        console.log('[tool:console_log]', msg);
        return { ok: true };
      }
      return { ok: false, error: `Unknown local tool ${tool}` };
    }
    return callMCPTool(url, tool, targs);
  }
  if (name === 'mcp_list') {
    const serverInput = args?.server ?? args?.url;
    const url = await resolveMCPServer(serverInput);
    if (url.startsWith('local://')) {
      return {
        tools: [
          {
            name: 'console_log',
            description: 'Log a message to the Stina console.',
            parameters: {
              type: 'object',
              properties: { message: { type: 'string' } },
              required: ['message'],
            },
          },
        ],
      };
    }
    return listMCPTools(url);
  }
  return { ok: false, error: `Unknown tool ${name}` };
}
