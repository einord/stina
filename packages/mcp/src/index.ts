import type { Json } from './client.js';

/**
 * MCP tool format (uses inputSchema)
 */
type MCPTool = {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
};

/**
 * BaseToolSpec format (uses parameters)
 */
type BaseToolSpec = {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
};

/**
 * Converts MCP tool format to BaseToolSpec format.
 * MCP uses 'inputSchema', we use 'parameters'.
 */
export function normalizeMCPTools(tools: MCPTool[]): BaseToolSpec[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description || '',
    parameters: {
      type: 'object' as const,
      properties: tool.inputSchema?.properties || {},
      required: tool.inputSchema?.required,
      additionalProperties: tool.inputSchema?.additionalProperties,
    },
  }));
}

/**
 * Simple helper verifying that the MCP package is properly wired.
 */
export function mcpPing(): void {
  console.log('[@stina/mcp] ping');
}

export { callMCPTool, MCPClient, type Json } from './client.js';
export { StdioMCPClient } from './stdio-client.js';

/**
 * Lists tools from a WebSocket MCP server and normalizes to BaseToolSpec format.
 */
export async function listMCPTools(url: string) {
  const { listMCPTools: rawListMCPTools } = await import('./client.js');
  const result = await rawListMCPTools(url);

  // MCP returns { tools: [...] }, normalize to BaseToolSpec format
  if (result && typeof result === 'object' && 'tools' in result) {
    const tools = (result as { tools: MCPTool[] }).tools;
    return normalizeMCPTools(tools);
  }
  return [];
}

/**
 * Convenience helper that connects to a stdio MCP server, lists tools, and disconnects.
 * Returns tools in BaseToolSpec format (parameters instead of inputSchema).
 */
export async function listStdioMCPTools(command: string) {
  const { StdioMCPClient } = await import('./stdio-client.js');
  const client = new StdioMCPClient(command);
  try {
    await client.connect();
    await client.initialize();
    const result = await client.listTools();
    await client.disconnect();

    // MCP returns { tools: [...] }, normalize to BaseToolSpec format
    if (result && typeof result === 'object' && 'tools' in result) {
      const tools = (result as { tools: MCPTool[] }).tools;
      return normalizeMCPTools(tools);
    }
    return [];
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
