// @ts-ignore - shimmed types declared under types/ws
import WebSocket from 'ws';

type RawData = string | Buffer | ArrayBuffer | Buffer[];

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

type JsonRpcResponse = {
  id?: number;
  result?: Json;
  error?: { message?: string } | null;
};

type Pending = { resolve: (v: Json) => void; reject: (e: Error) => void };

export interface MCPClientOptions {
  headers?: Record<string, string>;
}

/**
 * Minimal JSON-RPC-over-WebSocket client for interacting with MCP servers.
 */
export class MCPClient {
  private ws?: WebSocket;
  private id = 0;
  private pending = new Map<number, Pending>();
  constructor(
    private url: string,
    private options?: MCPClientOptions,
  ) {}

  /**
   * Opens (or reuses) a WebSocket connection to the configured MCP server.
   * @param timeoutMs Milliseconds to wait before failing.
   */
  async connect(timeoutMs = 5000) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    const wsOptions = this.options?.headers ? { headers: this.options.headers } : undefined;
    this.ws = new WebSocket(this.url, wsOptions);
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('MCP connect timeout')), timeoutMs);
      this.ws!.once('open', () => {
        clearTimeout(t);
        resolve();
      });
      this.ws!.once('error', (e: Error) => {
        clearTimeout(t);
        reject(e);
      });
    });
    this.ws.on('message', (data: RawData) => this.onMessage(normalizeMessage(data)));
  }

  /**
   * Handles inbound JSON-RPC messages and resolves pending promises.
   */
  private onMessage(data: string) {
    try {
      const parsed = JSON.parse(data) as JsonRpcResponse;
      if (!isJsonRpcResponse(parsed) || typeof parsed.id !== 'number') return;
      const pending = this.pending.get(parsed.id);
      if (!pending) return;
      this.pending.delete(parsed.id);
      if (parsed.error) pending.reject(new Error(parsed.error.message || 'MCP error'));
      else pending.resolve(parsed.result ?? null);
    } catch {
      /* ignore malformed messages */
    }
  }

  /**
   * Sends a JSON-RPC request and returns a promise resolved with the result.
   */
  private rpc<T = Json>(method: string, params: Json, timeoutMs = 30000): Promise<T> {
    const id = ++this.id;
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    this.ws!.send(payload);
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('MCP request timeout'));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(t);
          resolve(v as T);
        },
        reject: (e) => {
          clearTimeout(t);
          reject(e);
        },
      });
    });
  }

  /**
   * Issues the mandatory initialize RPC so servers know who we are.
   * After successful initialization, sends the required initialized notification.
   */
  async initialize(clientName = 'stina', version = '0.1.0') {
    await this.rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: clientName, version },
    });

    // Per MCP spec, client MUST send initialized notification after initialize response
    this.sendNotification('notifications/initialized');
  }

  /**
   * Sends a JSON-RPC notification (no response expected).
   * Implements the MCP specification requirement for sending notifications
   * without expecting responses from the server.
   */
  private sendNotification(method: string, params?: Json): void {
    const payload = JSON.stringify({ jsonrpc: '2.0', method, ...(params && { params }) });
    this.ws!.send(payload);
  }

  /**
   * Convenience wrapper for the tools/call RPC.
   */
  async callTool(name: string, args: Json) {
    return await this.rpc('tools/call', { name, arguments: args });
  }

  /**
   * Retrieves the list of tools from the server via tools/list.
   */
  async listTools() {
    return await this.rpc('tools/list', {});
  }

  /**
   * Attempts to close the active WebSocket connection.
   */
  async close() {
    try {
      this.ws?.close();
    } catch {}
  }
}

/**
 * Converts WebSocket binary frames into UTF-8 strings so they can be parsed as JSON.
 */
function normalizeMessage(data: RawData): string {
  if (typeof data === 'string') return data;
  if (data instanceof Buffer) return data.toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return String(data);
}

/**
 * Basic runtime validation for JSON-RPC responses to avoid crashing on malformed data.
 */
function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if ('id' in record && typeof record.id !== 'number') return false;
  if ('error' in record && record.error !== null && typeof record.error !== 'object') return false;
  return true;
}

/**
 * Convenience helper that connects, initializes, calls a tool, and tears down the client.
 */
export async function callMCPTool(
  url: string,
  name: string,
  args: Json,
  options?: MCPClientOptions,
) {
  const client = new MCPClient(url, options);
  await client.connect();
  await client.initialize();
  const result = await client.callTool(name, args);
  await client.close();
  return result;
}

/**
 * Convenience helper that returns the list of tools for a given MCP endpoint.
 */
export async function listMCPTools(url: string, options?: MCPClientOptions) {
  const client = new MCPClient(url, options);
  await client.connect();
  await client.initialize();
  const result = await client.listTools();
  await client.close();
  return result;
}
