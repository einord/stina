import type { Json } from './client.js';

/**
 * Simple helper verifying that the MCP package is properly wired.
 */
export function mcpPing(): void {
  console.log('[@stina/mcp] ping');
}

export { callMCPTool, MCPClient, listMCPTools, type Json } from './client.js';
export { StdioMCPClient } from './stdio-client.js';

/**
 * Convenience helper that connects to a stdio MCP server, lists tools, and disconnects.
 */
export async function listStdioMCPTools(command: string) {
  const { StdioMCPClient } = await import('./stdio-client.js');
  const client = new StdioMCPClient(command);
  try {
    await client.connect();
    await client.initialize();
    const result = await client.listTools();
    await client.disconnect();
    return result;
  } catch (err) {
    await client.disconnect();
    throw err;
  }
}

/**
 * Convenience helper that calls a tool on a stdio MCP server.
 */
export async function callStdioMCPTool(command: string, name: string, args: Json) {
  const { StdioMCPClient } = await import('./stdio-client.js');
  const client = new StdioMCPClient(command);
  try {
    await client.connect();
    await client.initialize();
    const result = await client.callTool(name, args);
    await client.disconnect();
    return result;
  } catch (err) {
    await client.disconnect();
    throw err;
  }
}
