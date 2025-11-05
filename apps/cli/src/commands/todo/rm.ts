import { Args, Command } from "@oclif/core";
import { callTool } from "../../utils/tool-runner";

export default class TodoRemove extends Command {
  static description = "Ta bort en uppgift";

  static args = {
    id: Args.string({ description: "Todo-ID", required: true })
  } as const;

  async run(): Promise<void> {
    const { args } = await this.parse(TodoRemove);
    await callTool("todo.delete", { id: args.id });
    this.log(`🗑️ Tog bort ${args.id}.`);
  }
}
