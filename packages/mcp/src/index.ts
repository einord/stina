/**
 * Simple helper verifying that the MCP package is properly wired.
 */
export function mcpPing(): void {
  console.log('[@stina/mcp] ping');
}

export { callMCPTool, MCPClient, listMCPTools } from './client.js';
