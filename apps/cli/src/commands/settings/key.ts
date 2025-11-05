import { Args, Command } from "@oclif/core";
import { callTool, fetchProviderConfig } from "../../utils/tool-runner";

export default class SettingsKey extends Command {
  static description = "Spara API-nyckel";

  static args = {
    provider: Args.string({ required: true }),
    key: Args.string({ required: true })
  } as const;

  async run(): Promise<void> {
    const { args } = await this.parse(SettingsKey);
    const current = (await fetchProviderConfig(args.provider)) ?? {};
    current.apiKey = args.key;
    await callTool("settings.provider", { provider: args.provider, config: current });
    this.log(`🔐 Nyckel uppdaterad för ${args.provider}`);
  }
}
