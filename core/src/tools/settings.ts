import { z } from "zod";
import { ToolContext, ProviderConfigInput, ProviderConfigListInput } from "./types.js";

const providerSchema = z.object({
  provider: z.enum(["openai", "anthropic", "ollama", "mock"]),
  config: z.record(z.unknown())
});

const providerListSchema = z.object({
  provider: z.string().optional()
});

export const settingsProvider = async (
  ctx: ToolContext,
  input: ProviderConfigInput
): Promise<{ status: "ok" }> => {
  const data = providerSchema.parse(input);
  await ctx.repo.setProviderConfig(data.provider, data.config);
  return { status: "ok" };
};

export const settingsProviderList = async (
  ctx: ToolContext,
  input: ProviderConfigListInput
): Promise<{ items: unknown[] }> => {
  const data = providerListSchema.parse(input);
  const configs = await ctx.repo.listProviderConfigs(data.provider);
  return { items: configs };
};
