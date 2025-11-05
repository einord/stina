import { z } from "zod";
import { ProjectCreateInput, ProjectListInput, ToolContext } from "./types.js";

const projectCreateSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional().nullable(),
  description: z.string().optional().nullable()
});

const projectListSchema = z.object({
  query: z.string().optional().nullable()
});

export const projectCreate = async (
  ctx: ToolContext,
  input: ProjectCreateInput
): Promise<{ id: string; status: "ok" }> => {
  const data = projectCreateSchema.parse(input);
  const project = await ctx.repo.createProject({
    name: data.name,
    color: data.color ?? null,
    description: data.description ?? null
  });
  return { id: project.id, status: "ok" };
};

export const projectList = async (
  ctx: ToolContext,
  input: ProjectListInput
): Promise<{ items: unknown[] }> => {
  const data = projectListSchema.parse(input);
  const items = await ctx.repo.listProjects(data.query ?? undefined);
  return { items };
};
