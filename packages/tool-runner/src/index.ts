import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, DataRepository, type ToolContext, instructionsGet, instructionsUpdate, projectCreate, projectList, scheduleCreate, scheduleList, scheduleUpdate, settingsProvider, settingsProviderList, todoCreate, todoDelete, todoList, todoUpdate } from "@pro-assist/core";

// Use __dirname in CJS, import.meta.url in ESM
const moduleDir = typeof __dirname !== "undefined" ? __dirname : fileURLToPath(new URL(".", import.meta.url));
const repoRoot = process.env.PRO_ASSIST_ROOT
  ? resolve(process.env.PRO_ASSIST_ROOT)
  : resolve(moduleDir, "..", "..", "..");
const DEFAULT_DB_PATH = resolve(repoRoot, "data", "pro-assist.db");

const getDatabasePath = () => {
  return process.env.PRO_ASSIST_DB ?? DEFAULT_DB_PATH;
};

const createContext = (): ToolContext => {
  const db = createDatabase({ path: getDatabasePath() });
  const repo = new DataRepository(db);
  return { repo };
};

export type ToolName =
  | "todo.create"
  | "todo.update"
  | "todo.delete"
  | "todo.list"
  | "project.create"
  | "project.list"
  | "instructions.get"
  | "instructions.update"
  | "schedule.create"
  | "schedule.update"
  | "schedule.list"
  | "settings.provider"
  | "settings.provider.list";

type ToolHandler = (ctx: ToolContext, payload: Record<string, unknown>) => Promise<unknown>;

const handlers: Record<ToolName, ToolHandler> = {
  "todo.create": (ctx, payload) => todoCreate(ctx, payload as any),
  "todo.update": (ctx, payload) => todoUpdate(ctx, payload as any),
  "todo.delete": (ctx, payload) => todoDelete(ctx, payload as any),
  "todo.list": (ctx, payload) => todoList(ctx, payload as any),
  "project.create": (ctx, payload) => projectCreate(ctx, payload as any),
  "project.list": (ctx, payload) => projectList(ctx, payload as any),
  "instructions.get": (ctx) => instructionsGet(ctx),
  "instructions.update": (ctx, payload) => instructionsUpdate(ctx, payload as any),
  "schedule.create": (ctx, payload) => scheduleCreate(ctx, payload as any),
  "schedule.update": (ctx, payload) => scheduleUpdate(ctx, payload as any),
  "schedule.list": (ctx, payload) => scheduleList(ctx, payload as any),
  "settings.provider": (ctx, payload) => settingsProvider(ctx, payload as any),
  "settings.provider.list": (ctx, payload) => settingsProviderList(ctx, payload as any)
};

export const runTool = async (tool: ToolName, payload: Record<string, unknown>) => {
  const handler = handlers[tool];
  if (!handler) {
    throw new Error(`Unknown tool: ${tool}`);
  }
  const ctx = createContext();
  return handler(ctx, payload);
};
