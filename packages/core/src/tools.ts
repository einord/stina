import { callMCPTool, callStdioMCPTool, listMCPTools, listStdioMCPTools } from '@stina/mcp';
import type { Json } from '@stina/mcp';
import {
  type MCPServer,
  buildMcpAuthHeaders,
  listMCPServers,
  resolveMCPServerConfig,
} from '@stina/settings';

import {
  getRunningMcpProcesses,
  startWebSocketMcpServer,
  stopAllMcpServers,
} from './mcp-server-manager.js';
import { logToolInvocation } from './tools/definitions/logging.js';
import { setTandoorMcpCaller, tandoorTools } from '@stina/tandoor/tools';
import { memoryTools } from '@stina/memories/tools';
import { peopleTools } from '@stina/people/tools';
import { profileTools } from '@stina/settings/tools';
import { todoTools } from '@stina/work/tools';
import { weatherTools } from '@stina/weather/tools';
import {
  type BaseToolSpec,
  type ToolDefinition,
  type ToolHandler,
  createToolSpecs,
  createToolSystemPrompt,
} from './tools/infrastructure/base.js';
import { callMCPToolByName } from './tools/infrastructure/mcp-caller.js';
import { createBuiltinTools } from './tools/infrastructure/registry.js';

type ToolModule = 'core' | 'todo' | 'memory' | 'weather' | 'tandoor' | 'people';

let builtinCatalog: BaseToolSpec[] = [];
let mcpToolCache: BaseToolSpec[] = [];
let combinedCatalog: BaseToolSpec[] = [];
let activeModules: Set<ToolModule> = new Set(['core', 'todo', 'memory', 'weather', 'tandoor', 'people']);

// Get reference to the shared running processes map
const runningMcpProcesses = getRunningMcpProcesses();
setTandoorMcpCaller(callMCPToolByName);

/**
 * Provides late-bound access to the builtin catalog so tool factories can read the final list.
 * Necessary because we need the catalog value before it is fully initialized.
 */
const getBuiltinCatalog = () => builtinCatalog;

const builtinHandlerMap = new Map<string, ToolHandler>();

const TOOL_MODULE_MAP = new Map<string, ToolModule>([
  ['todo_list', 'todo'],
  ['todo_add', 'todo'],
  ['todo_update', 'todo'],
  ['todo_comment_add', 'todo'],
  ['todo_step_add', 'todo'],
  ['todo_step_update', 'todo'],
  ['todo_step_delete', 'todo'],
  ['todo_step_reorder', 'todo'],
  ['project_list', 'todo'],
  ['project_add', 'todo'],
  ['project_update', 'todo'],
  ['project_delete', 'todo'],
  ['recurring_list', 'todo'],
  ['recurring_add', 'todo'],
  ['recurring_update', 'todo'],
  ['recurring_delete', 'todo'],
  ['weather_current', 'weather'],
  ['set_weather_location', 'weather'],
  ['memory_get_all', 'memory'],
  ['memory_get_details', 'memory'],
  ['memory_add', 'memory'],
  ['memory_update', 'memory'],
  ['memory_delete', 'memory'],
  ['people_list', 'people'],
  ['people_get', 'people'],
  ['people_upsert', 'people'],
  ['tandoor_get_todays_meal', 'tandoor'],
  ['tandoor_get_weekly_menu', 'tandoor'],
  ['tandoor_smart_shopping_list', 'tandoor'],
  ['tandoor_add_to_shopping_list', 'tandoor'],
  ['tandoor_get_shopping_list', 'tandoor'],
  ['tandoor_import_recipe', 'tandoor'],
  ['tandoor_search_recipes', 'tandoor'],
  ['tandoor_get_recipe', 'tandoor'],
  ['tandoor_suggest_skip', 'tandoor'],
  ['tandoor_get_meal_plans', 'tandoor'],
  ['tandoor_get_cook_log', 'tandoor'],
]);

const MODULE_TOOLS: Record<ToolModule, BaseToolSpec[]> = {
  core: [],
  todo: [],
  memory: [],
  weather: [],
  tandoor: [],
  people: [],
};

const toolDefinitions: ToolDefinition[] = [
  ...createBuiltinTools(getBuiltinCatalog, builtinHandlerMap),
  ...todoTools,
  ...memoryTools,
  ...peopleTools,
  ...profileTools,
  ...weatherTools,
  ...tandoorTools,
];

// Populate module mapping for quick lookup
for (const def of toolDefinitions) {
  const module = TOOL_MODULE_MAP.get(def.spec.name);
  if (module) {
    MODULE_TOOLS[module]?.push(def.spec);
  } else {
    MODULE_TOOLS.core.push(def.spec);
  }
}

builtinCatalog = toolDefinitions.map((def) => def.spec);
combinedCatalog = [...builtinCatalog];

const toolHandlers = new Map<string, ToolHandler>();
const builtinToolNames = new Set<string>();
const dynamicToolNames = new Set<string>();
for (const def of toolDefinitions) {
  toolHandlers.set(def.spec.name, def.handler);
}

// Now create the actual builtin tools with the populated handlers map
const finalBuiltinTools = createBuiltinTools(getBuiltinCatalog, builtinHandlerMap);
const finalToolDefinitions: ToolDefinition[] = [
  ...finalBuiltinTools,
  ...todoTools,
  ...memoryTools,
  ...peopleTools,
  ...profileTools,
  ...weatherTools,
  ...tandoorTools,
];

// Update the handlers map with the final definitions
toolHandlers.clear();
for (const def of finalToolDefinitions) {
  toolHandlers.set(def.spec.name, def.handler);
}

// Populate builtin handler map with the finalized implementations
for (const def of finalBuiltinTools) {
  builtinHandlerMap.set(def.spec.name, def.handler);
  builtinToolNames.add(def.spec.name);
}

// Update catalogs
builtinCatalog = finalToolDefinitions.map((def) => def.spec);
combinedCatalog = [...builtinCatalog];

/**
 * Returns builtin tool specs grouped by module name.
 */
export function getToolModulesCatalog(): Record<ToolModule, BaseToolSpec[]> {
  return {
    core: MODULE_TOOLS.core.slice(),
    todo: MODULE_TOOLS.todo.slice(),
    memory: MODULE_TOOLS.memory.slice(),
    weather: MODULE_TOOLS.weather.slice(),
    tandoor: MODULE_TOOLS.tandoor.slice(),
    people: MODULE_TOOLS.people.slice(),
  };
}

/**
 * Loads and caches all MCP tools from configured servers.
 * Should be called at session start to populate the tool catalog.
 */
export async function refreshMCPToolCache(): Promise<void> {
  clearDynamicTools();
  try {
    const config = await listMCPServers().catch(() => ({ servers: [], defaultServer: undefined }));
    const allMCPTools: BaseToolSpec[] = [];

    for (const server of config.servers || []) {
      if (server.enabled === false) continue;
      if (!shouldLoadServer(server.name)) {
        continue;
      }
      try {
        const tools = await loadServerTools(await resolveServerConfig(server.name));
        for (const spec of tools) {
          const decorated = normalizeMcpToolSpec(decorateMcpToolSpec(spec, server.name));
          if (toolHandlers.has(decorated.name) && !dynamicToolNames.has(decorated.name)) {
            console.warn(
              `[tools] Skipping MCP tool "${decorated.name}" from ${server.name} because a tool with the same name already exists.`,
            );
            continue;
          }
          const handler = createMcpProxyHandler(server, spec.name);
          if (!handler) continue;
          toolHandlers.set(decorated.name, handler);
          dynamicToolNames.add(decorated.name);
          allMCPTools.push(decorated);
        }
      } catch (err) {
        console.warn(`[tools] Failed to load tools from ${server.name}:`, err);
      }
    }

    mcpToolCache = allMCPTools;
    combinedCatalog = [...builtinCatalog, ...mcpToolCache];
  } catch (err) {
    console.warn('[tools] Failed to refresh MCP tool cache:', err);
    clearDynamicTools();
    mcpToolCache = [];
    combinedCatalog = [...builtinCatalog];
  }
}

/**
 * Returns the current combined catalog (builtin + cached MCP tools).
 */
export function getToolCatalog(): BaseToolSpec[] {
  return combinedCatalog.filter((spec) => isModuleEnabled(spec.name));
}

/**
 * Flattened tool specs suitable for feeding into providers via the tool system prompt.
 * Note: This will be stale until refreshMCPToolCache is called. Use getToolSpecs() for fresh data.
 */
export const toolSpecs = createToolSpecs(builtinCatalog);

/**
 * Returns fresh tool specs including current MCP cache.
 */
export function getToolSpecs() {
  return createToolSpecs(getToolCatalog());
}

/**
 * Helper string that instructs the provider which tools exist and how to call them.
 * Note: This will be stale until refreshMCPToolCache is called. Use getToolSystemPrompt() for fresh data.
 */
export const toolSystemPrompt = createToolSystemPrompt(builtinCatalog);

/**
 * Returns fresh tool system prompt including current MCP cache.
 */
export function getToolSystemPrompt(): string {
  return createToolSystemPrompt(getToolCatalog());
}

/**
 * Raw catalog of builtin tool specs, useful for listing available tools.
 */
export const builtinToolCatalog = builtinCatalog;

/**
 * Finds and executes a named tool, returning the handler result or an error payload.
 * Call this whenever the model or UI asks to invoke a registered tool.
 * @param name Tool identifier, e.g. `todo.add`.
 * @param args Input arguments passed to the tool.
 */
export async function runTool(name: string, args: unknown) {
  if (!isModuleEnabled(name)) {
    return { ok: false, error: `Tool disabled: ${name}` };
  }
  await logToolInvocation(name, args);
  const handler = toolHandlers.get(name);
  if (!handler) {
    return { ok: false, error: `Unknown tool ${name}` };
  }
  return handler(args ?? {});
}

/**
 * Removes previously registered MCP tool handlers and metadata.
 * Ensures we don't leak stale handlers when refreshing tool caches.
 */
function clearDynamicTools() {
  for (const name of dynamicToolNames) {
    if (!builtinToolNames.has(name)) {
      toolHandlers.delete(name);
    }
  }
  dynamicToolNames.clear();
}

function isModuleEnabled(toolName: string): boolean {
  if (activeModules.has('core') && !TOOL_MODULE_MAP.has(toolName)) return true;
  const module = TOOL_MODULE_MAP.get(toolName);
  if (!module) return true;
  return activeModules.has(module);
}

function shouldLoadServer(serverName: string): boolean {
  // Skip loading Tandoor server tools if module disabled
  if (!activeModules.has('tandoor') && (serverName === 'tandoor' || serverName.toLowerCase().includes('tandoor'))) {
    return false;
  }
  return true;
}

/**
 * Sets which built-in tool modules are enabled. Core is always enabled.
 */
export function setActiveToolModules(mods: Partial<Record<ToolModule, boolean>>) {
  const next = new Set<ToolModule>(['core']);
  for (const mod of ['todo', 'memory', 'weather', 'tandoor', 'people'] as const) {
    if (mods[mod] !== false) next.add(mod);
  }
  activeModules = next;
}

/**
 * Loads tool specifications for the provided MCP server definition.
 */
async function resolveServerConfig(name: string): Promise<MCPServer> {
  return await resolveMCPServerConfig(name);
}

async function loadServerTools(server: MCPServer): Promise<BaseToolSpec[]> {
  if (server.type === 'stdio') {
    if (!server.command) {
      console.warn(`[tools] MCP server ${server.name} missing command`);
      return [];
    }
    return (await listStdioMCPTools(server.command, server.args, server.env)) as BaseToolSpec[];
  }

  if (!server.url || server.url.startsWith('local://')) {
    // Local/builtin servers are already registered directly.
    return [];
  }

  // Start WebSocket server if it has a command
  if (server.command) {
    await startWebSocketMcpServer(server);
  }

  const headers = buildMcpAuthHeaders(server);
  return (await listMCPTools(server.url, headers ? { headers } : undefined)) as BaseToolSpec[];
}

/**
 * Appends server metadata to the MCP tool description for better UX.
 */
function decorateMcpToolSpec(spec: BaseToolSpec, serverName: string): BaseToolSpec {
  const suffix = `Server: ${serverName}`;
  const description = spec.description?.includes(suffix)
    ? spec.description
    : `${spec.description || ''}\n(${suffix})`.trim();
  return {
    ...spec,
    description,
  };
}

/**
 * Builds a ToolHandler that proxies invocation to the proper MCP transport.
 */
function createMcpProxyHandler(server: MCPServer, remoteToolName: string): ToolHandler | null {
  if (process.env.DEBUG) {
    console.debug(
      `${server.name} -> Creating MCP proxy handler for tool: ${remoteToolName} of type ${server.type}`,
    );
  }
  if (server.type === 'stdio') {
    if (!server.command) {
      console.warn(`[tools] MCP server ${server.name} missing command for stdio transport`);
      return null;
    }
    const command = server.command;
    const commandArgs = server.args;
    const env = server.env;
    return async (args: unknown) =>
      callStdioMCPTool(command, remoteToolName, toJsonValue(args), commandArgs, env);
  }

  if (!server.url) {
    console.warn(`[tools] MCP server ${server.name} missing URL for websocket transport`);
    return null;
  }
  const url = server.url;
  const headers = buildMcpAuthHeaders(server);
  return async (args: unknown) =>
    callMCPTool(url, remoteToolName, toJsonValue(args), headers ? { headers } : undefined);
}

/**
 * Normalizes arbitrary tool arguments into MCP-compatible JSON structures.
 */
function toJsonValue(value: unknown): Json {
  if (value == null) return {};
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) return value as Json;
  if (typeof value === 'object') {
    return value as Record<string, Json>;
  }
  return {};
}

/**
 * Ensures remote MCP schemas comply with OpenAI's requirements.
 * Most servers follow standard JSON Schema, but the OpenAI API rejects array
 * definitions that omit an items field even when the schema declares unions.
 */
function normalizeMcpToolSpec(spec: BaseToolSpec): BaseToolSpec {
  if (!spec.parameters || typeof spec.parameters !== 'object') {
    return spec;
  }
  return {
    ...spec,
    parameters: normalizeSchemaNode(spec.parameters) as BaseToolSpec['parameters'],
  };
}

type SchemaRecord = Record<string, unknown>;

/**
 * Recursively walks a JSON schema node and inserts default array items where needed.
 */
function normalizeSchemaNode(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map((entry) => normalizeSchemaNode(entry));
  }
  if (!node || typeof node !== 'object') return node;

  const schema = { ...(node as SchemaRecord) };
  const typeValue = schema.type;
  const hasArrayType =
    typeValue === 'array' || (Array.isArray(typeValue) && typeValue.includes('array'));

  if (hasArrayType) {
    if (!('items' in schema) || schema.items == null) {
      schema.items = {};
    }
  }

  if ('items' in schema && schema.items && typeof schema.items === 'object') {
    schema.items = normalizeSchemaNode(schema.items);
  }

  if ('properties' in schema && schema.properties && typeof schema.properties === 'object') {
    const props = schema.properties as Record<string, unknown>;
    schema.properties = Object.fromEntries(
      Object.entries(props).map(([key, value]) => [key, normalizeSchemaNode(value)]),
    );
  }

  for (const keyword of ['anyOf', 'allOf', 'oneOf'] as const) {
    if (Array.isArray(schema[keyword])) {
      schema[keyword] = (schema[keyword] as unknown[]).map((entry) => normalizeSchemaNode(entry));
    }
  }

  return schema;
}

/**
 * Shuts down all running MCP server processes.
 * Call this when the application exits.
 */
export function shutdownMcpServers(): void {
  stopAllMcpServers();
}
