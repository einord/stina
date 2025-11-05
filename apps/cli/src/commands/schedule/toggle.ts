import { Args, Flags, Command } from "@oclif/core";
import { callTool } from "../../utils/tool-runner";

export default class ScheduleToggle extends Command {
  static description = "Aktivera/inaktivera schema";

  static args = {
    id: Args.string({ description: "Schema-ID", required: true })
  } as const;

  static flags = {
    active: Flags.boolean({ description: "Sätt aktiv status", allowNo: true })
  } as const;

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ScheduleToggle);
    if (typeof flags.active !== "boolean") {
      this.error("Ange --active eller --no-active");
      return;
    }
    await callTool("schedule.update", { id: args.id, patch: { active: flags.active } });
    this.log(`${flags.active ? "✅" : "⏸"} Uppdaterade ${args.id}`);
  }
}
