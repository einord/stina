// @ts-ignore - shimmed types declared under types/ws
import WebSocket from 'ws';

type RawData = string | Buffer | ArrayBuffer | Buffer[];

export type Json = any;

type Pending = { resolve: (v: any) => void; reject: (e: any) => void };

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
      const msg = JSON.parse(data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || 'MCP error'));
        else resolve(msg.result);
      }
    } catch (e) {
      /* ignore */
    }
  }

  private rpc(method: string, params: Json, timeoutMs = 10000): Promise<any> {
    const id = ++this.id;
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    this.ws!.send(payload);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('MCP request timeout'));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(t);
          resolve(v);
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
