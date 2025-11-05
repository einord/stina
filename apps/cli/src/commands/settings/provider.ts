import { Args, Flags, Command } from "@oclif/core";
import { callTool } from "../../utils/tool-runner";

export default class SettingsProvider extends Command {
  static description = "Konfigurera AI-leverantör";

  static args = {
    provider: Args.string({ required: true, description: "Provider (mock|openai|anthropic|ollama)" })
  } as const;

  static flags = {
    key: Flags.string({ description: "API-nyckel" }),
    model: Flags.string({ description: "Modell" }),
    host: Flags.string({ description: "Endpoint" }),
    base: Flags.string({ description: "Bas-URL" })
  } as const;

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SettingsProvider);
    const config: Record<string, unknown> = {};
    if (flags.key) config.apiKey = flags.key;
    if (flags.model) config.model = flags.model;
    if (flags.host) config.host = flags.host;
    if (flags.base) config.baseURL = flags.base;
    await callTool("settings.provider", { provider: args.provider, config });
    this.log(`💡 Uppdaterade provider ${args.provider}.`);
  }
}
