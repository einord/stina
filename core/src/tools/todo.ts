import { z } from "zod";
import { ToolContext, TodoCreateInput, TodoDeleteInput, TodoListInput, TodoUpdateInput } from "./types.js";

const todoCreateSchema = z.object({
  title: z.string().min(1),
  projectId: z.string().optional().nullable(),
  due: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
  priority: z.enum(["low", "normal", "high"]).optional().default("normal")
});

const todoUpdateSchema = z.object({
  id: z.string(),
  patch: z.object({
    title: z.string().optional(),
    projectId: z.string().nullable().optional(),
    due: z.string().datetime().nullable().optional(),
    notes: z.string().nullable().optional(),
    priority: z.enum(["low", "normal", "high"]).optional(),
    completed: z.boolean().optional()
  })
});

const todoListSchema = z.object({
  filter: z
    .object({
      projectId: z.string().optional(),
      completed: z.boolean().optional(),
      query: z.string().optional()
    })
    .optional(),
  limit: z.number().int().positive().max(200).optional(),
  offset: z.number().int().nonnegative().optional()
});

const todoDeleteSchema = z.object({
  id: z.string()
});

export const todoCreate = async (
  ctx: ToolContext,
  input: TodoCreateInput
): Promise<{ id: string; status: "ok" }> => {
  const data = todoCreateSchema.parse(input);
  const todo = await ctx.repo.createTodo({
    title: data.title,
    projectId: data.projectId ?? null,
    due: data.due ?? null,
    notes: data.notes ?? null,
    priority: data.priority ?? "normal",
    completed: false
  });
  return { id: todo.id, status: "ok" };
};

export const todoUpdate = async (
  ctx: ToolContext,
  input: TodoUpdateInput
): Promise<{ id: string; status: "ok" }> => {
  const data = todoUpdateSchema.parse(input);
  const todo = await ctx.repo.updateTodo(data.id, {
    ...data.patch,
    projectId: data.patch.projectId ?? null,
    due: data.patch.due ?? null,
    notes: data.patch.notes ?? null
  });
  return { id: todo.id, status: "ok" };
};

export const todoDelete = async (
  ctx: ToolContext,
  input: TodoDeleteInput
): Promise<{ id: string; status: "ok" }> => {
  const data = todoDeleteSchema.parse(input);
  await ctx.repo.deleteTodo(data.id);
  return { id: data.id, status: "ok" };
};

export const todoList = async (
  ctx: ToolContext,
  input: TodoListInput
): Promise<{ items: unknown[] }> => {
  const data = todoListSchema.parse(input);
  const items = await ctx.repo.listTodos({
    ...data.filter,
    limit: data.limit,
    offset: data.offset
  });
  return { items };
};
