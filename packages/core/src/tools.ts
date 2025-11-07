import util from 'node:util';

import { callMCPTool, listMCPTools } from '@stina/mcp';
import { listMCPServers, resolveMCPServer } from '@stina/settings';
import store, { TodoItem, TodoStatus } from '@stina/store';

import { logToolMessage } from './log.js';

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
  {
    name: 'todo_list',
    description: 'List todo items that are stored locally inside Stina.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: "Optional status filter. Use 'pending' or 'completed'.",
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of items to return (defaults to 20).',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'todo_add',
    description: 'Create a new todo item that the assistant should remember.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Short description of the task.',
        },
        description: {
          type: 'string',
          description: 'Optional longer context or notes.',
        },
        due_at: {
          type: 'string',
          description: 'Optional due date/time (ISO 8601).',
        },
        metadata: {
          type: 'object',
          description: 'Optional JSON metadata for the tool.',
          additionalProperties: true,
        },
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
  {
    name: 'todo_update',
    description: 'Update or complete an existing todo item.',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Todo identifier returned from todo_list/todo_add.',
        },
        title: {
          type: 'string',
          description: 'New title.',
        },
        description: {
          type: 'string',
          description: 'New description.',
        },
        status: {
          type: 'string',
          description: "Set to 'pending' or 'completed'.",
        },
        due_at: {
          type: 'string',
          description: 'New due date/time (ISO 8601).',
        },
        metadata: {
          type: 'object',
          description: 'Replace metadata payload.',
          additionalProperties: true,
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'notify_user',
    description: 'Post an automated message from a tool into the chat so the human user sees it.',
    parameters: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'What the user should be told.',
        },
        tool: {
          type: 'string',
          description: 'Name of the tool or service sending the notification.',
        },
      },
      required: ['message'],
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

export const toolSystemPrompt = `You are Stina, a meticulous personal assistant. You can call function tools whenever they will help you complete a task. Available built-in tools are:\n- ${builtinSummary}\nUse "list_tools" whenever you need to inspect the full tool catalogue (including external MCP servers). To work with an MCP server, call "mcp_list" to inspect it and then "mcp_call" to run a specific tool. Always explain the result to the user after using tools.`;

const TOOL_ARGS_MAX_LEN = 180;
const DEFAULT_TODO_LIMIT = 20;

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

async function logToolInvocation(name: string, args: any) {
  try {
    const label = formatToolLabel(name, args);
    const argPreview = formatArgsPreview(args);
    const content = argPreview
      ? `Tool • ${label} • args: ${argPreview}`
      : `Tool • ${label}`;

    await store.appendMessage({ role: 'info', content });
  } catch (err) {
    console.warn('[tool] failed to append log message', err);
  }
}

function formatToolLabel(name: string, args: any): string {
  if (name === 'mcp_call') {
    const target = typeof args?.tool === 'string' ? args.tool : args?.name;
    const server = typeof args?.server === 'string' ? args.server : args?.url;
    if (target && server) return `${name} → ${target} @ ${server}`;
    if (target) return `${name} → ${target}`;
  }
  if (name === 'mcp_list' || name === 'list_tools') {
    const server = typeof args?.server === 'string' ? args.server : args?.source;
    if (server) return `${name} (${server})`;
  }
  return name;
}

function formatArgsPreview(args: any): string | undefined {
  if (args == null) return undefined;
  if (typeof args === 'string') {
    return args.length > TOOL_ARGS_MAX_LEN ? `${args.slice(0, TOOL_ARGS_MAX_LEN)}…` : args;
  }
  if (typeof args === 'number' || typeof args === 'boolean') {
    return String(args);
  }
  if (typeof args === 'object' && Object.keys(args).length === 0) {
    return undefined;
  }
  try {
    const json = JSON.stringify(args);
    if (!json) return undefined;
    return json.length > TOOL_ARGS_MAX_LEN ? `${json.slice(0, TOOL_ARGS_MAX_LEN)}…` : json;
  } catch (err) {
    return String(args);
  }
}

function formatConsoleLogPayload(value: any): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    for (const key of ['text', 'content', 'value']) {
      if (typeof (value as any)[key] === 'string') {
        return (value as any)[key];
      }
    }
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const json = JSON.stringify(value);
    if (json && json !== '{}') return json;
  } catch {}
  return util.inspect(value, { depth: 3, maxArrayLength: 20 });
}

function normalizeTodoStatus(value: any): TodoStatus | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'pending' || normalized === 'open') return 'pending';
  if (normalized === 'completed' || normalized === 'done') return 'completed';
  return undefined;
}

function toTodoPayload(item: TodoItem) {
  return {
    id: item.id,
    title: item.title,
    description: item.description ?? null,
    status: item.status,
    due_at: item.dueAt ?? null,
    due_at_iso: typeof item.dueAt === 'number' ? new Date(item.dueAt).toISOString() : null,
    metadata: item.metadata ?? null,
    source: item.source ?? null,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

function parseDueAt(input: any): number | null {
  if (input == null) return null;
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

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
      return { tools: builtinToolCatalog };
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

async function handleTodoList(args: any) {
  const status = normalizeTodoStatus(args?.status);
  const limitRaw = typeof args?.limit === 'number' ? Math.floor(args.limit) : undefined;
  const limit = limitRaw && limitRaw > 0 ? Math.min(limitRaw, 200) : DEFAULT_TODO_LIMIT;
  const todos = store.listTodos({ status, limit });
  return { ok: true, todos: todos.map(toTodoPayload) };
}

async function handleTodoAdd(args: any) {
  const title = typeof args?.title === 'string' ? args.title : '';
  const description = typeof args?.description === 'string' ? args.description : undefined;
  const dueAt = parseDueAt(args?.due_at ?? args?.dueAt);
  const metadata = typeof args?.metadata === 'object' && args?.metadata !== null ? args.metadata : undefined;
  try {
    const todo = await store.createTodo({
      title,
      description,
      dueAt,
      metadata: metadata ?? null,
    });
    return { ok: true, todo: toTodoPayload(todo) };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

async function handleTodoUpdate(args: any) {
  const id = typeof args?.id === 'string' ? args.id.trim() : '';
  if (!id) {
    return { ok: false, error: 'todo_update requires { id }' };
  }
  const patch: any = {};
  if (typeof args?.title === 'string') patch.title = args.title;
  if (typeof args?.description === 'string') patch.description = args.description;
  const status = normalizeTodoStatus(args?.status);
  if (status) patch.status = status;
  const dueAt = parseDueAt(args?.due_at ?? args?.dueAt);
  if (dueAt !== null) patch.dueAt = dueAt;
  if (args?.due_at === null || args?.dueAt === null) patch.dueAt = null;
  if (args?.metadata === null) patch.metadata = null;
  else if (typeof args?.metadata === 'object') patch.metadata = args.metadata;

  try {
    const next = await store.updateTodo(id, patch);
    if (!next) {
      return { ok: false, error: `Todo not found: ${id}` };
    }
    return { ok: true, todo: toTodoPayload(next) };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

async function handleNotifyUser(args: any) {
  const message = typeof args?.message === 'string' ? args.message : '';
  if (!message.trim()) {
    return { ok: false, error: 'notify_user requires { message }' };
  }
  const tool = typeof args?.tool === 'string' ? args.tool : undefined;
  try {
    const entry = await store.appendAutomationMessage(tool, message);
    return { ok: true, message_id: entry.id };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
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
    case 'todo_list':
      return handleTodoList(args ?? {});
    case 'todo_add':
      return handleTodoAdd(args ?? {});
    case 'todo_update':
      return handleTodoUpdate(args ?? {});
    case 'notify_user':
      return handleNotifyUser(args ?? {});
    default:
      await logToolInvocation(name, args);
      return { ok: false, error: `Unknown tool ${name}` };
  }
}
