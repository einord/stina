import { Args, Flags, Command } from "@oclif/core";
import { callTool } from "../../utils/tool-runner";

export default class TodoEdit extends Command {
  static description = "Uppdatera en uppgift";

  static args = {
    id: Args.string({ description: "Todo-ID", required: true })
  } as const;

  static flags = {
    title: Flags.string({ description: "Ny titel" }),
    notes: Flags.string({ description: "Anteckningar" }),
    due: Flags.string({ description: "Deadline ISO" }),
    priority: Flags.string({ options: ["low", "normal", "high"] })
  } as const;

  async run(): Promise<void> {
    const { args, flags } = await this.parse(TodoEdit);
    const patch: Record<string, unknown> = {};
    if (flags.title) patch.title = flags.title;
    if (flags.notes) patch.notes = flags.notes;
    if (flags.due) patch.due = flags.due;
    if (flags.priority) patch.priority = flags.priority;
    if (!Object.keys(patch).length) {
      this.log("Inga ändringar angivna.");
      return;
    }
    await callTool("todo.update", { id: args.id, patch });
    this.log(`✏️ Uppdaterade ${args.id}.`);
  }
}
