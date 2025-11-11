import {
  type BaseToolSpec,
  type ToolDefinition,
  type ToolHandler,
  createToolSpecs,
  createToolSystemPrompt,
} from './tools/base.js';
import { createBuiltinTools } from './tools/builtin.js';
import { logToolInvocation } from './tools/logging.js';
import { memoryTools } from './tools/memories.js';
import { profileTools } from './tools/profile.js';
import { todoTools } from './tools/todos.js';

let builtinCatalog: BaseToolSpec[] = [];
let mcpToolCache: BaseToolSpec[] = [];
let combinedCatalog: BaseToolSpec[] = [];

/**
 * Provides late-bound access to the builtin catalog so tool factories can read the final list.
 * Necessary because we need the catalog value before it is fully initialized.
 */
const getBuiltinCatalog = () => builtinCatalog;

const toolDefinitions: ToolDefinition[] = [
  ...createBuiltinTools(getBuiltinCatalog, new Map()),
  ...todoTools,
  ...memoryTools,
  ...profileTools,
];

builtinCatalog = toolDefinitions.map((def) => def.spec);
combinedCatalog = [...builtinCatalog];

const toolHandlers = new Map<string, ToolHandler>();
for (const def of toolDefinitions) {
  toolHandlers.set(def.spec.name, def.handler);
}

// Now create the actual builtin tools with the populated handlers map
const finalBuiltinTools = createBuiltinTools(getBuiltinCatalog, toolHandlers);
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

// Update catalogs
builtinCatalog = finalToolDefinitions.map((def) => def.spec);
combinedCatalog = [...builtinCatalog];

/**
 * Loads and caches all MCP tools from configured servers.
 * Should be called at session start to populate the tool catalog.
 */
export async function refreshMCPToolCache(): Promise<void> {
  try {
    const { listMCPServers } = await import('@stina/settings');
    const { listMCPTools, listStdioMCPTools } = await import('@stina/mcp');

    const config = await listMCPServers().catch(() => ({ servers: [], defaultServer: undefined }));
    const allMCPTools: BaseToolSpec[] = [];

    for (const server of config.servers || []) {
      try {
        let tools: BaseToolSpec[] = [];

        if (server.type === 'stdio' && server.command) {
          const mcpTools = await listStdioMCPTools(server.command);
          tools = mcpTools as BaseToolSpec[];
        } else if (server.type === 'websocket' && server.url) {
          const mcpTools = await listMCPTools(server.url);
          tools = mcpTools as BaseToolSpec[];
        }

        allMCPTools.push(...tools);
      } catch (err) {
        console.warn(`[tools] Failed to load tools from ${server.name}:`, err);
      }
    }

    mcpToolCache = allMCPTools;
    combinedCatalog = [...builtinCatalog, ...mcpToolCache];
  } catch (err) {
    console.warn('[tools] Failed to refresh MCP tool cache:', err);
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
