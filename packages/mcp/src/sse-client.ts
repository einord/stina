import { EventSource } from 'eventsource';
import { getDebugMode } from '@stina/settings';

import type { Json } from './client.js';

type JsonRpcResponse = {
  id?: number;
  result?: Json;
  error?: { message?: string } | null;
};

type Pending = { resolve: (v: Json) => void; reject: (e: Error) => void };

/**
 * JSON-RPC-over-SSE client for interacting with MCP servers via Server-Sent Events.
 * Uses EventSource for receiving server events and fetch for sending requests.
 */
export class SseMCPClient {
  private eventSource?: EventSource;
  private id = 0;
  private pending = new Map<number, Pending>();
  private isDebugMode = false;

  constructor(private baseUrl: string) {}

  /**
   * Connects to the SSE endpoint and sets up event handling.
   * @param timeoutMs Milliseconds to wait before failing.
   */
  async connect(timeoutMs = 5000): Promise<void> {
    if (this.eventSource && this.eventSource.readyState === EventSource.OPEN) return;

    this.isDebugMode = await getDebugMode();
    if (this.isDebugMode) {
      console.debug(`[SseMCPClient] Connecting to ${this.baseUrl}/sse`);
    }

    return new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('MCP SSE connect timeout')), timeoutMs);

      try {
        this.eventSource = new EventSource(`${this.baseUrl}/sse`);

        // Handle incoming messages
        this.eventSource.onmessage = (event) => {
          if (this.isDebugMode) {
            console.debug(`[SseMCPClient] Received: ${event.data}`);
          }
          this.onMessage(event.data);
        };

        // Handle connection open
        this.eventSource.onopen = () => {
          if (this.isDebugMode) {
            console.debug(`[SseMCPClient] Connected to ${this.baseUrl}/sse`);
          }
          clearTimeout(t);
          resolve();
        };

        // Handle errors
        this.eventSource.onerror = (err) => {
          if (this.isDebugMode) {
            console.error(`[SseMCPClient] Connection error:`, err);
          }
          clearTimeout(t);
          reject(new Error('SSE connection error'));
        };
      } catch (err) {
        clearTimeout(t);
        reject(err);
      }
    });
  }

  /**
   * Handles inbound JSON-RPC messages and resolves pending promises.
   */
  private onMessage(data: string) {
    try {
      const parsed = JSON.parse(data) as JsonRpcResponse;
      if (!this.isJsonRpcResponse(parsed) || typeof parsed.id !== 'number') return;

      const pending = this.pending.get(parsed.id);
      if (!pending) return;

      this.pending.delete(parsed.id);
      if (parsed.error) {
        pending.reject(new Error(parsed.error.message || 'MCP error'));
      } else {
        pending.resolve(parsed.result ?? null);
      }
    } catch {
      /* ignore malformed messages */
    }
  }

  /**
   * Type guard for JSON-RPC responses.
   */
  private isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
    return typeof value === 'object' && value !== null && 'id' in value;
  }

  /**
   * Sends a JSON-RPC request via POST to /message and returns a promise resolved with the result.
   */
  private rpc<T = Json>(method: string, params: Json, timeoutMs = 10000): Promise<T> {
    const id = ++this.id;
    const payload = { jsonrpc: '2.0', id, method, params };

    if (this.isDebugMode) {
      console.debug(`[SseMCPClient] Sending: ${JSON.stringify(payload)}`);
    }

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

      // Send request via POST to /message endpoint
      fetch(`${this.baseUrl}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
        .then((response) => {
          if (!response.ok) {
            this.pending.delete(id);
            clearTimeout(t);
            reject(new Error(`SSE request failed: ${response.status} ${response.statusText}`));
          }
          // Response will come via SSE, so we don't process it here
        })
        .catch((err) => {
          this.pending.delete(id);
          clearTimeout(t);
          reject(err);
        });
    });
  }

  /**
   * Issues the mandatory initialize RPC so servers know who we are.
   */
  async initialize(clientName = 'stina', version = '0.1.0') {
    await this.rpc('initialize', { clientInfo: { name: clientName, version }, capabilities: {} });
  }

  /**
   * Convenience wrapper for the tools/call RPC.
   */
  async callTool(name: string, args: Json) {
    return await this.rpc('tools/call', { name, arguments: args });
  }

  /**
   * Requests the list of available tools from the server.
   */
  async listTools() {
    return await this.rpc('tools/list', {});
  }

  /**
   * Gracefully disconnects from the server.
   */
  async disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }
    this.pending.clear();
  }
}
