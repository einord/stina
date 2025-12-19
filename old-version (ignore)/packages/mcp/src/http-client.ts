import type { Json } from './client.js';

export interface HttpMCPClientOptions {
  headers?: Record<string, string>;
}

type JsonRpcResponse = {
  id?: number;
  result?: Json;
  error?: { message?: string } | null;
};

/**
 * Minimal HTTP (stateless) MCP client for servers that expose streamable HTTP/SSE endpoints.
 * Uses plain JSON-RPC over POST and does not maintain any long-lived connection.
 */
export class HttpMCPClient {
  private id = 0;
  constructor(
    private url: string,
    private options?: HttpMCPClientOptions,
  ) {}

  private async rpc<T = Json>(method: string, params: Json): Promise<T> {
    const id = ++this.id;
    const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(this.options?.headers ?? {}),
    };
    const resp = await fetch(this.url, {
      method: 'POST',
      headers,
      body,
    });
    if (!resp.ok) {
      throw new Error(`HTTP MCP request failed with status ${resp.status}`);
    }
    const json = (await resp.json()) as JsonRpcResponse;
    if (!json || typeof json !== 'object') {
      throw new Error('Invalid MCP response payload');
    }
    if (json.error) {
      throw new Error(json.error.message || 'MCP error');
    }
    return (json.result ?? null) as T;
  }

  async initialize(clientName = 'stina', version = '0.1.0') {
    await this.rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: clientName, version },
    });
    // For stateless HTTP we skip sending notifications/initialized
  }

  async callTool(name: string, args: Json) {
    return await this.rpc('tools/call', { name, arguments: args });
  }

  async listTools() {
    return await this.rpc('tools/list', {});
  }
}
