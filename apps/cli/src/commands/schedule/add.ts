import { Args, Flags, Command } from "@oclif/core";
import { callTool } from "../../utils/tool-runner";

export default class ScheduleAdd extends Command {
  static description = "Skapa en schemalagd trigger";

  static args = {
    title: Args.string({ description: "Titel", required: true }),
    message: Args.string({ description: "Meddelande", required: true }),
    cron: Args.string({ description: "Cron-uttryck", required: true })
  } as const;

  static flags = {
    inactive: Flags.boolean({ description: "Skapa som inaktiv" })
  } as const;

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ScheduleAdd);
    await callTool("schedule.create", {
      title: args.title,
      message: args.message,
      cron: args.cron,
      active: !flags.inactive
    });
    this.log(`⏰ La till schema '${args.title}'`);
  }
}
