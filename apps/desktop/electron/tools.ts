import { callMCPTool, listMCPTools } from '@stina/mcp';
import { listMCPServers, resolveMCPServer } from '@stina/settings';

import consoleLogTool from './tools/builtins/console-log.js';
import listToolsTool from './tools/builtins/list-tools.js';
import mcpCallTool from './tools/builtins/mcp-call.js';
import mcpListTool from './tools/builtins/mcp-list.js';
import type {
  BaseToolSpec,
  BuiltinTool,
  JsonSchemaProperty,
  ToolContext,
} from './tools/types.js';

const builtinTools: BuiltinTool[] = [consoleLogTool, listToolsTool, mcpListTool, mcpCallTool];

const builtinToolCatalog = builtinTools.map((tool) => tool.spec);
const builtinSummary = builtinToolCatalog
  .map((tool) => `${tool.name}: ${tool.description}`)
  .join('\n- ');

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
  openai: builtinToolCatalog.map(toOpenAITool),
  ollama: builtinToolCatalog.map(toOpenAITool),
  anthropic: builtinToolCatalog.map(toAnthropicTool),
  gemini: [
    {
      functionDeclarations: builtinToolCatalog.map(toGeminiTool),
    },
  ],
} as const;

export const toolSystemPrompt = `You are Stina, a meticulous personal assistant. You can call function tools whenever they will help you complete a task. Available built-in tools are:\n- ${builtinSummary}\nUse "list_tools" whenever you need to inspect the full tool catalogue (including external MCP servers). To work with an MCP server, call "mcp_list" to inspect it and then "mcp_call" to run a specific tool. Always explain the result to the user after using tools.`;

const builtinMap = new Map(builtinTools.map((tool) => [tool.name, tool]));

async function invokeBuiltin(name: string, args: any, ctx: ToolContext) {
  const tool = builtinMap.get(name);
  if (!tool) return { ok: false, error: `Unknown tool ${name}` };
  return tool.run(args, ctx);
}

function createContext(): ToolContext {
  const ctx: ToolContext = {
    resolveServer: (input) => resolveMCPServer(input),
    listServers: () => listMCPServers(),
    listRemoteTools: (url) => listMCPTools(url),
    callRemoteTool: (url, tool, args) => callMCPTool(url, tool, args),
    builtinCatalog: () => builtinToolCatalog,
    runBuiltin: (name, args) => invokeBuiltin(name, args, ctx),
  };
  return ctx;
}

export async function runTool(name: string, args: any) {
  const ctx = createContext();
  return invokeBuiltin(name, args, ctx);
}
