import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { McpClient } from "@pro-assist/core/mcp";

const argv = yargs(hideBin(process.argv))
  .option("server", { type: "string", default: process.env.MCP_SLACK_URL })
  .option("token", { type: "string", default: process.env.MCP_SLACK_TOKEN })
  .option("user", { type: "string", demandOption: true })
  .option("message", { type: "string", demandOption: true })
  .parseSync();

const client = new McpClient({ url: argv.server, token: argv.token });

const run = async () => {
  const response = await client.invoke("slack.sendDm", {
    user: argv.user,
    message: argv.message
  });
  console.log(response);
};

run();
