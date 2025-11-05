import { Flags, Command } from "@oclif/core";
import { callTool } from "../../utils/tool-runner";
import type { Todo } from "@pro-assist/core/data/repository";

export default class TodoList extends Command {
  static description = "Lista att-göra-poster";

  static flags = {
    project: Flags.string({ char: "p", description: "Projekt-ID" }),
    all: Flags.boolean({ char: "a", description: "Visa även slutförda" })
  } as const;

  async run(): Promise<void> {
    const { flags } = await this.parse(TodoList);
    const response = await callTool<{ items: Todo[] }>("todo.list", {
      filter: {
        projectId: flags.project ?? undefined,
        completed: flags.all ? undefined : false
      }
    });
    if (!response.items.length) {
      this.log("(tom lista)");
      return;
    }
    for (const todo of response.items) {
      const status = todo.completed ? "✔" : "•";
      const due = todo.due ? ` (due ${new Date(todo.due).toLocaleString()})` : "";
      this.log(`${status} ${todo.title}${due}`);
    }
  }
}
