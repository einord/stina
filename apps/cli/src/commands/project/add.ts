import { Args, Flags, Command } from "@oclif/core";
import { callTool } from "../../utils/tool-runner";

export default class ProjectAdd extends Command {
  static description = "Skapa ett projekt";

  static args = {
    name: Args.string({ description: "Projektnamn", required: true })
  } as const;

  static flags = {
    color: Flags.string({ description: "Färg" }),
    description: Flags.string({ description: "Beskrivning" })
  } as const;

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ProjectAdd);
    await callTool("project.create", {
      name: args.name,
      color: flags.color ?? null,
      description: flags.description ?? null
    });
    this.log(`📁 Skapade projekt: ${args.name}`);
  }
}
