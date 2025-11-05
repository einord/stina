import { CronExpressionParser } from "cron-parser";
import { z } from "zod";
import {
  ScheduleCreateInput,
  ScheduleListInput,
  ScheduleUpdateInput,
  ToolContext
} from "./types.js";

const scheduleCreateSchema = z.object({
  title: z.string().min(1),
  message: z.string().min(1),
  cron: z.string(),
  active: z.boolean().optional()
});

const scheduleUpdateSchema = z.object({
  id: z.string(),
  patch: z.object({
    title: z.string().optional(),
    message: z.string().optional(),
    cron: z.string().optional(),
    active: z.boolean().optional()
  })
});

const scheduleListSchema = z.object({
  activeOnly: z.boolean().optional()
});

const validateCron = (cron: string): void => {
  CronExpressionParser.parse(cron);
};

export const scheduleCreate = async (
  ctx: ToolContext,
  input: ScheduleCreateInput
): Promise<{ id: string; status: "ok" }> => {
  const data = scheduleCreateSchema.parse(input);
  validateCron(data.cron);
  const schedule = await ctx.repo.createSchedule({
    title: data.title,
    message: data.message,
    cron: data.cron,
    active: data.active ?? true
  });
  return { id: schedule.id, status: "ok" };
};

export const scheduleUpdate = async (
  ctx: ToolContext,
  input: ScheduleUpdateInput
): Promise<{ id: string; status: "ok" }> => {
  const data = scheduleUpdateSchema.parse(input);
  if (data.patch.cron) {
    validateCron(data.patch.cron);
  }
  const schedule = await ctx.repo.updateSchedule(data.id, data.patch);
  return { id: schedule.id, status: "ok" };
};

export const scheduleList = async (
  ctx: ToolContext,
  input: ScheduleListInput
): Promise<{ items: unknown[] }> => {
  const data = scheduleListSchema.parse(input);
  const items = await ctx.repo.listSchedules(data.activeOnly ?? false);
  return { items };
};
