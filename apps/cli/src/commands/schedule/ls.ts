import { Flags, Command } from "@oclif/core";
import { callTool } from "../../utils/tool-runner";
import type { Schedule } from "@pro-assist/core/data/repository";

export default class ScheduleList extends Command {
  static description = "Lista scheman";

  static flags = {
    active: Flags.boolean({ description: "Visa endast aktiva" })
  } as const;

  async run(): Promise<void> {
    const { flags } = await this.parse(ScheduleList);
    const response = await callTool<{ items: Schedule[] }>("schedule.list", {
      activeOnly: flags.active ?? false
    });
    if (!response.items.length) {
      this.log("Inga scheman");
      return;
    }
    for (const schedule of response.items) {
      this.log(`${schedule.id}: ${schedule.title} -> ${schedule.cron} (${schedule.message})`);
    }
  }
}
