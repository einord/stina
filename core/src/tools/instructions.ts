import { z } from "zod";
import { ToolContext, InstructionsUpdateInput } from "./types.js";

const instructionsSchema = z.object({
  reminders: z.array(z.string()).default([]),
  tone: z.string().default("professional"),
  workingHours: z.record(z.unknown()).default({}),
  routines: z.array(z.unknown()).default([])
});

export const instructionsGet = async (
  ctx: ToolContext
): Promise<{ instructions: z.infer<typeof instructionsSchema> }> => {
  const record = await ctx.repo.getInstructionSet();
  if (!record) {
    const defaults = instructionsSchema.parse({});
    return { instructions: defaults };
  }
  try {
    return { instructions: instructionsSchema.parse(JSON.parse(record.data)) };
  } catch (error) {
    console.warn("Failed to parse instruction set, resetting to defaults.", error);
    const defaults = instructionsSchema.parse({});
    return { instructions: defaults };
  }
};

export const instructionsUpdate = async (
  ctx: ToolContext,
  input: InstructionsUpdateInput
): Promise<{ status: "ok" }> => {
  const patchSchema = instructionsSchema.deepPartial().strict();
  const patch = patchSchema.parse(input.patch);
  const existing = await instructionsGet(ctx);
  const updated = { ...existing.instructions, ...patch };
  await ctx.repo.upsertInstructionSet(JSON.stringify(updated));
  return { status: "ok" };
};
