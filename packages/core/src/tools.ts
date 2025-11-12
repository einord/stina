import { callMCPTool, callStdioMCPTool, listMCPTools, listStdioMCPTools } from '@stina/mcp';
import { listMCPServers, type MCPServer } from '@stina/settings';
import { logToolInvocation } from './tools/definitions/logging.js';
import { memoryTools } from './tools/definitions/memories.js';
import { profileTools } from './tools/definitions/profile.js';
import { todoTools } from './tools/definitions/todos.js';
import {
  type BaseToolSpec,
  type ToolDefinition,
  type ToolHandler,
  createToolSpecs,
  createToolSystemPrompt,
} from './tools/infrastructure/base.js';
import { createBuiltinTools } from './tools/infrastructure/registry.js';
import type { Json } from '@stina/mcp';

let builtinCatalog: BaseToolSpec[] = [];
let mcpToolCache: BaseToolSpec[] = [];
let combinedCatalog: BaseToolSpec[] = [];

/**
 * Provides late-bound access to the builtin catalog so tool factories can read the final list.
 * Necessary because we need the catalog value before it is fully initialized.
 */
const getBuiltinCatalog = () => builtinCatalog;

const builtinHandlerMap = new Map<string, ToolHandler>();

const toolDefinitions: ToolDefinition[] = [
  ...createBuiltinTools(getBuiltinCatalog, builtinHandlerMap),
  ...todoTools,
  ...memoryTools,
  ...profileTools,
];

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
  ...profileTools,
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
 * Loads and caches all MCP tools from configured servers.
 * Should be called at session start to populate the tool catalog.
 */
export async function refreshMCPToolCache(): Promise<void> {
  clearDynamicTools();
  try {
    const config = await listMCPServers().catch(() => ({ servers: [], defaultServer: undefined }));
    const allMCPTools: BaseToolSpec[] = [];

    for (const server of config.servers || []) {
      try {
        const tools = await loadServerTools(server);
        for (const spec of tools) {
          const decorated = decorateMcpToolSpec(spec, server.name);
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
  return combinedCatalog;
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
  return createToolSpecs(combinedCatalog);
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
  return createToolSystemPrompt(combinedCatalog);
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

/**
 * Loads tool specifications for the provided MCP server definition.
 */
async function loadServerTools(server: MCPServer): Promise<BaseToolSpec[]> {
  if (server.type === 'stdio') {
    if (!server.command) {
      console.warn(`[tools] MCP server ${server.name} missing command`);
      return [];
    }
    return (await listStdioMCPTools(server.command)) as BaseToolSpec[];
  }

  if (!server.url || server.url.startsWith('local://')) {
    // Local/builtin servers are already registered directly.
    return [];
  }
  return (await listMCPTools(server.url)) as BaseToolSpec[];
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
  if (server.type === 'stdio') {
    if (!server.command) {
      console.warn(`[tools] MCP server ${server.name} missing command for stdio transport`);
      return null;
    }
    const command = server.command;
    return async (args: unknown) => callStdioMCPTool(command, remoteToolName, toJsonValue(args));
  }

  if (!server.url) {
    console.warn(`[tools] MCP server ${server.name} missing URL for websocket transport`);
    return null;
  }
  const url = server.url;
  return async (args: unknown) => callMCPTool(url, remoteToolName, toJsonValue(args));
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
