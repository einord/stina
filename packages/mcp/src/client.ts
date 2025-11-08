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

export class MCPClient {
  private ws?: WebSocket;
  private id = 0;
  private pending = new Map<number, Pending>();
  constructor(private url: string) {}

  async connect(timeoutMs = 5000) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    this.ws = new WebSocket(this.url);
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

  private rpc<T = Json>(method: string, params: Json, timeoutMs = 10000): Promise<T> {
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

  async initialize(clientName = 'stina', version = '0.1.0') {
    await this.rpc('initialize', { clientInfo: { name: clientName, version }, capabilities: {} });
  }

  async callTool(name: string, args: Json) {
    return await this.rpc('tools/call', { name, arguments: args });
  }

  async listTools() {
    return await this.rpc('tools/list', {});
  }

  async close() {
    try {
      this.ws?.close();
    } catch {}
  }
}

function normalizeMessage(data: RawData): string {
  if (typeof data === 'string') return data;
  if (data instanceof Buffer) return data.toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return String(data);
}

function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if ('id' in record && typeof record.id !== 'number') return false;
  if ('error' in record && record.error !== null && typeof record.error !== 'object') return false;
  return true;
}

export async function callMCPTool(url: string, name: string, args: Json) {
  const client = new MCPClient(url);
  await client.connect();
  await client.initialize();
  const result = await client.callTool(name, args);
  await client.close();
  return result;
}

export async function listMCPTools(url: string) {
  const client = new MCPClient(url);
  await client.connect();
  await client.initialize();
  const result = await client.listTools();
  await client.close();
  return result;
}
