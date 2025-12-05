import type { Json, MCPClientOptions } from './client.js';

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

export { MCPClient, type Json, type MCPClientOptions } from './client.js';
export { StdioMCPClient, type StdioMCPClientOptions } from './stdio-client.js';
export { HttpMCPClient, type HttpMCPClientOptions } from './http-client.js';

/**
 * Lists tools from a WebSocket MCP server and normalizes to BaseToolSpec format.
 */
export async function listMCPTools(url: string, options?: import('./client.js').MCPClientOptions) {
  // HTTP/SSE (stateless) path
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const { HttpMCPClient } = await import('./http-client.js');
    const client = new HttpMCPClient(url, { headers: options?.headers });
    await client.initialize();
    const result = await client.listTools();
    return normalizeList(result);
  }

  const { listMCPTools: rawListMCPTools } = await import('./client.js');
  const result = await rawListMCPTools(url, options);
  return normalizeList(result);
}

function normalizeList(result: unknown) {
  if (result && typeof result === 'object' && 'tools' in (result as any)) {
    const tools = (result as { tools: MCPTool[] }).tools;
    return normalizeMCPTools(tools);
  }
  return [];
}

/**
 * Convenience helper that calls a tool on any MCP server (HTTP/SSE or WebSocket).
 */
export async function callMCPTool(
  url: string,
  name: string,
  args: Json,
  options?: MCPClientOptions,
) {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const { HttpMCPClient } = await import('./http-client.js');
    const client = new HttpMCPClient(url, { headers: options?.headers });
    await client.initialize();
    return await client.callTool(name, args);
  }

  const { MCPClient } = await import('./client.js');
  const client = new MCPClient(url, options);
  await client.connect();
  await client.initialize();
  const result = await client.callTool(name, args);
  await client.close();
  return result;
}

/**
 * Convenience helper that connects to a stdio MCP server, lists tools, and disconnects.
 * Returns tools in BaseToolSpec format (parameters instead of inputSchema).
 */
export async function listStdioMCPTools(
  command: string,
  commandArgs?: string,
  env?: Record<string, string>,
) {
  const { StdioMCPClient } = await import('./stdio-client.js');
  const client = new StdioMCPClient(command, commandArgs, { env });
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
export async function callStdioMCPTool(
  command: string,
  name: string,
  args: Json,
  commandArgs?: string,
  env?: Record<string, string>,
) {
  const { StdioMCPClient } = await import('./stdio-client.js');
  const client = new StdioMCPClient(command, commandArgs, { env });
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
 * Convenience helper for HTTP/SSE (stateless) MCP servers.
 */
export async function callHttpMCPTool(
  url: string,
  name: string,
  args: Json,
  options?: import('./http-client.js').HttpMCPClientOptions,
) {
  const { HttpMCPClient } = await import('./http-client.js');
  const client = new HttpMCPClient(url, options);
  await client.initialize();
  return await client.callTool(name, args);
}
