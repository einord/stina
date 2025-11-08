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
const getBuiltinCatalog = () => builtinCatalog;

const toolDefinitions: ToolDefinition[] = [...createBuiltinTools(getBuiltinCatalog), ...todoTools];

builtinCatalog = toolDefinitions.map((def) => def.spec);

const toolHandlers = new Map<string, ToolHandler>();
for (const def of toolDefinitions) {
  toolHandlers.set(def.spec.name, def.handler);
}

export const toolSpecs = createToolSpecs(builtinCatalog);
export const toolSystemPrompt = createToolSystemPrompt(builtinCatalog);

export async function runTool(name: string, args: unknown) {
  const handler = toolHandlers.get(name);
  if (!handler) {
    await logToolInvocation(name, args);
    return { ok: false, error: `Unknown tool ${name}` };
  }
  return handler(args ?? {});
}
