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

export { callMCPTool, MCPClient, type Json, type MCPClientOptions } from './client.js';
export { StdioMCPClient } from './stdio-client.js';
export { SseMCPClient } from './sse-client.js';

/**
 * Lists tools from a WebSocket MCP server and normalizes to BaseToolSpec format.
 */
export async function listMCPTools(url: string, options?: import('./client.js').MCPClientOptions) {
  const { listMCPTools: rawListMCPTools } = await import('./client.js');
  const result = await rawListMCPTools(url, options);

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
export async function listStdioMCPTools(command: string, commandArgs?: string) {
  const { StdioMCPClient } = await import('./stdio-client.js');
  const client = new StdioMCPClient(command, commandArgs);
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
export async function callStdioMCPTool(command: string, name: string, args: Json, commandArgs?: string) {
  const { StdioMCPClient } = await import('./stdio-client.js');
  const client = new StdioMCPClient(command, commandArgs);
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

/**
 * Convenience helper that connects to an SSE MCP server, lists tools, and disconnects.
 * Returns tools in BaseToolSpec format (parameters instead of inputSchema).
 */
export async function listSseMCPTools(baseUrl: string, options?: import('./client.js').MCPClientOptions) {
  const { SseMCPClient } = await import('./sse-client.js');
  const client = new SseMCPClient(baseUrl, options);
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
 * Convenience helper that calls a tool on an SSE MCP server.
 */
export async function callSseMCPTool(
  baseUrl: string,
  name: string,
  args: Json,
  options?: import('./client.js').MCPClientOptions,
) {
  console.log(`[callSseMCPTool] Calling tool '${name}' on ${baseUrl}`);
  console.log(`[callSseMCPTool] Tool args:`, JSON.stringify(args));

  const { SseMCPClient } = await import('./sse-client.js');
  const client = new SseMCPClient(baseUrl, options);
  try {
    console.log(`[callSseMCPTool] Connecting...`);
    await client.connect();
    console.log(`[callSseMCPTool] Initializing...`);
    await client.initialize();
    console.log(`[callSseMCPTool] Calling tool...`);
    const result = await client.callTool(name, args);
    console.log(`[callSseMCPTool] Tool call successful`);
    await client.disconnect();
    return result;
  } catch (err) {
    console.error(`[callSseMCPTool] Error calling tool '${name}':`, err);
    console.error(`[callSseMCPTool] Error type: ${err instanceof Error ? err.name : typeof err}`);
    console.error(`[callSseMCPTool] Error message: ${err instanceof Error ? err.message : String(err)}`);
    await client.disconnect();
    throw err;
  }
}
