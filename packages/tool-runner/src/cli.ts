#!/usr/bin/env node
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { runTool, type ToolName } from "./index";

const cli = yargs(hideBin(process.argv))
  .scriptName("proassist-tool")
  .usage("$0 <tool> [json]")
  .command(
    "$0 <tool> [payload]",
    "Run a Pro Assist tool",
    (y) =>
      y
        .positional("tool", {
          describe: "Tool identifier (todo.create, schedule.list, ...)",
          type: "string"
        })
        .positional("payload", {
          describe: "JSON payload string",
          type: "string",
          default: "{}"
        }),
    async (argv) => {
      try {
        const payload = JSON.parse(argv.payload as string);
        const result = await runTool(argv.tool as ToolName, payload);
        process.stdout.write(JSON.stringify(result));
      } catch (error) {
        process.stderr.write((error as Error).message);
        process.exitCode = 1;
      }
    }
  )
  .help();

cli.parse();
