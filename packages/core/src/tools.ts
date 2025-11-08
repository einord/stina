import {
  type BaseToolSpec,
  type ToolDefinition,
  type ToolHandler,
  createToolSpecs,
  createToolSystemPrompt,
} from './tools/base.js';
import { createBuiltinTools } from './tools/builtin.js';
import { logToolInvocation } from './tools/logging.js';
import { todoTools } from './tools/todos.js';

let builtinCatalog: BaseToolSpec[] = [];
/**
 * Provides late-bound access to the builtin catalog so tool factories can read the final list.
 * Necessary because we need the catalog value before it is fully initialized.
 */
const getBuiltinCatalog = () => builtinCatalog;

const toolDefinitions: ToolDefinition[] = [...createBuiltinTools(getBuiltinCatalog), ...todoTools];

builtinCatalog = toolDefinitions.map((def) => def.spec);

const toolHandlers = new Map<string, ToolHandler>();
for (const def of toolDefinitions) {
  toolHandlers.set(def.spec.name, def.handler);
}

/**
 * Flattened tool specs suitable for feeding into providers via the tool system prompt.
 */
export const toolSpecs = createToolSpecs(builtinCatalog);
/**
 * Helper string that instructs the provider which tools exist and how to call them.
 */
export const toolSystemPrompt = createToolSystemPrompt(builtinCatalog);

/**
 * Finds and executes a named tool, returning the handler result or an error payload.
 * Call this whenever the model or UI asks to invoke a registered tool.
 * @param name Tool identifier, e.g. `todo.add`.
 * @param args Input arguments passed to the tool.
 */
export async function runTool(name: string, args: unknown) {
  const handler = toolHandlers.get(name);
  if (!handler) {
    await logToolInvocation(name, args);
    return { ok: false, error: `Unknown tool ${name}` };
  }
  return handler(args ?? {});
}
