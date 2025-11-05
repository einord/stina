import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { McpClient } from "@pro-assist/core/mcp";

const argv = yargs(hideBin(process.argv))
  .option("server", { type: "string", default: process.env.MCP_DOCKER_URL })
  .parseSync();

const client = new McpClient({ url: argv.server });

const run = async () => {
  const response = await client.invoke("docker.listContainers", {});
  console.log(JSON.stringify(response, null, 2));
};

run();
