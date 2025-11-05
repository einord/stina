import { Flags, Command } from "@oclif/core";
import { callTool } from "../../utils/tool-runner";
import type { Project } from "@pro-assist/core/data/repository";

export default class ProjectList extends Command {
  static description = "Lista projekt";

  static flags = {
    search: Flags.string({ char: "q", description: "Sökterm" })
  } as const;

  async run(): Promise<void> {
    const { flags } = await this.parse(ProjectList);
    const response = await callTool<{ items: Project[] }>("project.list", {
      query: flags.search ?? null
    });
    if (!response.items.length) {
      this.log("Inga projekt");
      return;
    }
    for (const project of response.items) {
      const color = project.color ? ` [${project.color}]` : "";
      this.log(`${project.id}: ${project.name}${color}`);
    }
  }
}
