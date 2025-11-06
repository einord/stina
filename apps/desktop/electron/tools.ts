import { callMCPTool, listMCPTools } from '@stina/mcp';
import { listMCPServers, resolveMCPServer } from '@stina/settings';

type JsonSchema = {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
};

type JsonSchemaProperty =
  | {
      type: 'string' | 'number' | 'integer' | 'boolean';
      description?: string;
    }
  | {
      type: 'object';
      properties?: Record<string, JsonSchemaProperty>;
      required?: string[];
      additionalProperties?: boolean;
      description?: string;
    }
  | {
      type: 'array';
      items?: JsonSchemaProperty;
      description?: string;
    };

type BaseToolSpec = {
  name: string;
  description: string;
  parameters: JsonSchema;
};

const baseTools: BaseToolSpec[] = [
  {
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
  {
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
  {
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
  {
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
];

function toOpenAITool(tool: BaseToolSpec) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

function toAnthropicTool(tool: BaseToolSpec) {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  };
}

type GeminiSchema =
  | { type: 'STRING' | 'NUMBER' | 'BOOLEAN'; description?: string }
  | { type: 'ARRAY'; items?: GeminiSchema; description?: string }
  | {
      type: 'OBJECT';
      properties?: Record<string, GeminiSchema>;
      required?: string[];
      description?: string;
    }
  | { type: 'ANY'; description?: string };

function toGeminiSchema(property?: JsonSchemaProperty): GeminiSchema {
  if (!property || typeof property !== 'object' || !('type' in property)) {
    return { type: 'ANY' };
  }
  switch (property.type) {
    case 'string':
      return { type: 'STRING', description: property.description };
    case 'number':
    case 'integer':
      return { type: 'NUMBER', description: property.description };
    case 'boolean':
      return { type: 'BOOLEAN', description: property.description };
    case 'array':
      return {
        type: 'ARRAY',
        description: property.description,
        items: property.items ? toGeminiSchema(property.items) : { type: 'ANY' },
      };
    case 'object': {
      const props: Record<string, GeminiSchema> = {};
      const entries = Object.entries(property.properties ?? {});
      for (const [key, value] of entries) {
        props[key] = toGeminiSchema(value);
      }
      return {
        type: 'OBJECT',
        description: property.description,
        properties: props,
        required: property.required,
      };
    }
    default:
      return { type: 'ANY', description: (property as any).description };
  }
}

function toGeminiTool(tool: BaseToolSpec) {
  return {
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'OBJECT',
      properties: Object.fromEntries(
        Object.entries(tool.parameters.properties).map(([key, value]) => [key, toGeminiSchema(value)]),
      ),
      required: tool.parameters.required,
    },
  };
}

export const toolSpecs = {
  openai: baseTools.map(toOpenAITool),
  ollama: baseTools.map(toOpenAITool),
  anthropic: baseTools.map(toAnthropicTool),
  gemini: [
    {
      functionDeclarations: baseTools.map(toGeminiTool),
    },
  ],
} as const;

const builtinToolCatalog = baseTools.map((tool) => ({
  name: tool.name,
  description: tool.description,
  parameters: tool.parameters,
}));

const builtinSummary = builtinToolCatalog
  .map((tool) => `${tool.name}: ${tool.description}`)
  .join('\n- ');

export const toolSystemPrompt = `You are Stina, a meticulous personal assistant. You can call function tools whenever they will help you complete a task. Available built-in tools are:\n- ${builtinSummary}\nUse \"list_tools\" whenever you need to inspect the full tool catalogue (including external MCP servers). To work with an MCP server, call \"mcp_list\" to inspect it and then \"mcp_call\" to run a specific tool. Always explain the result to the user after using tools.`;

async function handleConsoleLog(args: any) {
  const msg = typeof args?.message === 'string' ? args.message : String(args);
  console.log('[tool:console_log]', msg);
  return { ok: true };
}

async function handleMcpList(args: any) {
  try {
    const serverInput = args?.server ?? args?.url;
    const url = await resolveMCPServer(serverInput);
    if (url.startsWith('local://')) {
      return { tools: builtinToolCatalog };
    }
    return await listMCPTools(url);
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

type ToolServerSummary = { name: string; url?: string; tools?: any; error?: string };
type ListToolsSuccess = {
  ok: true;
  requested: string | null;
  builtin: typeof builtinToolCatalog | [];
  servers: ToolServerSummary[];
};
type ListToolsError = {
  ok: false;
  requested: string | null;
  builtin: typeof builtinToolCatalog | [];
  error: string;
};

async function handleListTools(args: any): Promise<ListToolsSuccess | ListToolsError> {
  const serverInput = args?.server ?? args?.source ?? null;
  const includeBuiltin = args?.include_builtin !== false && args?.includeBuiltin !== false;
  const includeRemote = args?.include_remote !== false && args?.includeRemote !== false;

  const requested = serverInput ? String(serverInput) : null;
  const builtin = includeBuiltin ? builtinToolCatalog : [];

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

export async function runTool(name: string, args: any) {
  switch (name) {
    case 'console_log':
      return handleConsoleLog(args);
    case 'list_tools':
      return handleListTools(args ?? {});
    case 'mcp_list':
      return handleMcpList(args ?? {});
    case 'mcp_call':
      return handleMcpCall(args ?? {});
    default:
      return { ok: false, error: `Unknown tool ${name}` };
  }
}
