import { Args, Flags, Command } from "@oclif/core";
import { callTool } from "../../utils/tool-runner";

export default class TodoAdd extends Command {
  static description = "Lägg till en ny att-göra-post";

  static args = {
    title: Args.string({ description: "Titel", required: true })
  } as const;

  static flags = {
    project: Flags.string({ char: "p", description: "Projekt-ID" }),
    due: Flags.string({ description: "Deadline i ISO-format" }),
    priority: Flags.string({ options: ["low", "normal", "high"], default: "normal" })
  } as const;

  async run(): Promise<void> {
    const { args, flags } = await this.parse(TodoAdd);
    await callTool("todo.create", {
      title: args.title,
      projectId: flags.project ?? null,
      due: flags.due ?? null,
      notes: null,
      priority: flags.priority
    });
    this.log(`✅ Skapade uppgift: ${args.title}`);
  }
}
