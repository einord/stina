import { Args, Command } from "@oclif/core";
import { callTool, fetchProviderConfig } from "../../utils/tool-runner";

export default class SettingsModel extends Command {
  static description = "Sätt modell för given provider";

  static args = {
    provider: Args.string({ required: true }),
    model: Args.string({ required: true })
  } as const;

  async run(): Promise<void> {
    const { args } = await this.parse(SettingsModel);
    const current = (await fetchProviderConfig(args.provider)) ?? {};
    current.model = args.model;
    await callTool("settings.provider", { provider: args.provider, config: current });
    this.log(`🧠 Modell för ${args.provider} satt till ${args.model}`);
  }
}
