import { runTool, type ToolName } from "@pro-assist/tool-runner";

export const callTool = async <T = unknown>(tool: ToolName, payload: Record<string, unknown>) => {
  return runTool(tool, payload) as Promise<T>;
};

export const fetchProviderConfig = async (
  provider: string
): Promise<Record<string, unknown> | null> => {
  const response = (await callTool<{ items: Array<{ provider: string; config: Record<string, unknown> }> }>(
    "settings.provider.list",
    { provider }
  )) as { items: Array<{ provider: string; config: Record<string, unknown> }> };
  return response.items[0]?.config ?? null;
};
