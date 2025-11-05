import { Args, Command } from "@oclif/core";
import { callTool } from "../../utils/tool-runner";

export default class TodoDone extends Command {
  static description = "Markera uppgift som klar";

  static args = {
    id: Args.string({ description: "Todo-ID", required: true })
  } as const;

  async run(): Promise<void> {
    const { args } = await this.parse(TodoDone);
    await callTool("todo.update", { id: args.id, patch: { completed: true } });
    this.log(`✅ Markerade ${args.id} som klar.`);
  }
}
