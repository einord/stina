import { Command } from "@oclif/core";
import { callTool } from "../../utils/tool-runner";

export default class SettingsList extends Command {
  static description = "Visa sparade providerinställningar";

  async run(): Promise<void> {
    const response = await callTool<{
      items: Array<{ provider: string; config: Record<string, unknown> }>;
    }>("settings.provider.list", {});
    if (!response.items.length) {
      this.log("Inga sparade inställningar.");
      return;
    }
    for (const entry of response.items) {
      this.log(`${entry.provider}: ${JSON.stringify(entry.config)}`);
    }
  }
}
