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
  private messageEndpoint?: string;
  private sessionId?: string;

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
      let endpointReceived = false;

      try {
        this.eventSource = new EventSource(`${this.baseUrl}/sse`);

        // Handle connection open
        this.eventSource.onopen = () => {
          if (this.isDebugMode) {
            console.debug(`[SseMCPClient] Connected to ${this.baseUrl}/sse, waiting for endpoint event`);
          }
        };

        // Handle incoming messages (default "message" event type)
        this.eventSource.onmessage = (event) => {
          console.log(`[SseMCPClient] Received 'message' event:`, event.data);
          this.onMessage(event.data);
        };

        // Listen for common SSE event types
        for (const eventType of ['response', 'data', 'jsonrpc', 'result', 'error']) {
          this.eventSource.addEventListener(eventType, (event: MessageEvent) => {
            console.log(`[SseMCPClient] Received '${eventType}' event:`, event.data);
            this.onMessage(event.data);
          });
        }

        // Handle "endpoint" event type - this tells us where to send messages
        this.eventSource.addEventListener('endpoint', (event: MessageEvent) => {
          if (this.isDebugMode) {
            console.debug(`[SseMCPClient] Received endpoint event: ${event.data}`);
          }

          try {
            let endpointUri: string;

            // Try to parse as JSON first (MCP spec format: { uri: "..." })
            try {
              const data = JSON.parse(event.data);
              endpointUri = data.uri || data.url;
            } catch {
              // If not JSON, treat as plain URI string
              endpointUri = event.data.trim();
            }

            if (endpointUri) {
              // rmcp sends: /message?sessionId=xxx
              // Use the endpoint URI exactly as provided - session ID stays in query string
              this.messageEndpoint = endpointUri.startsWith('http')
                ? endpointUri
                : `${this.baseUrl}${endpointUri}`;

              // Extract session ID for logging/debugging
              try {
                const url = new URL(endpointUri, this.baseUrl);
                this.sessionId = url.searchParams.get('sessionId') || undefined;
              } catch {
                this.sessionId = undefined;
              }

              console.log(
                `[SseMCPClient] Message endpoint: ${this.messageEndpoint}, Session ID: ${this.sessionId}`,
              );

              endpointReceived = true;
              clearTimeout(t);
              resolve();
            }
          } catch (err) {
            if (this.isDebugMode) {
              console.error(`[SseMCPClient] Failed to process endpoint event:`, err);
            }
          }
        });

        // Handle errors
        this.eventSource.onerror = (err) => {
          console.error(`[SseMCPClient] SSE error. ReadyState: ${this.eventSource?.readyState}`, err);
          if (!endpointReceived) {
            clearTimeout(t);
            reject(new Error('SSE connection error'));
          }
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
    if (this.isDebugMode) {
      console.debug(`[SseMCPClient] Processing message: ${data.substring(0, 200)}...`);
      console.debug(`[SseMCPClient] Pending requests: ${Array.from(this.pending.keys()).join(', ')}`);
    }

    try {
      const parsed = JSON.parse(data) as JsonRpcResponse;

      if (this.isDebugMode) {
        console.debug(`[SseMCPClient] Parsed JSON:`, parsed);
      }

      if (!this.isJsonRpcResponse(parsed)) {
        if (this.isDebugMode) {
          console.debug(`[SseMCPClient] Not a JSON-RPC response (missing 'id' field)`);
        }
        return;
      }

      if (typeof parsed.id !== 'number') {
        if (this.isDebugMode) {
          console.debug(`[SseMCPClient] Response id is not a number: ${typeof parsed.id}`);
        }
        return;
      }

      const pending = this.pending.get(parsed.id);
      if (!pending) {
        if (this.isDebugMode) {
          console.debug(`[SseMCPClient] No pending request for id ${parsed.id}`);
        }
        return;
      }

      if (this.isDebugMode) {
        console.debug(`[SseMCPClient] Resolving request ${parsed.id}`);
      }

      this.pending.delete(parsed.id);
      if (parsed.error) {
        pending.reject(new Error(parsed.error.message || 'MCP error'));
      } else {
        pending.resolve(parsed.result ?? null);
      }
    } catch (err) {
      if (this.isDebugMode) {
        console.error(`[SseMCPClient] Failed to parse message:`, err);
      }
    }
  }

  /**
   * Type guard for JSON-RPC responses.
   */
  private isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
    return typeof value === 'object' && value !== null && 'id' in value;
  }

  /**
   * Sends a JSON-RPC request via POST to the message endpoint and returns a promise resolved with the result.
   */
  private rpc<T = Json>(method: string, params: Json, timeoutMs = 10000): Promise<T> {
    if (!this.messageEndpoint) {
      return Promise.reject(new Error('Message endpoint not yet received from server'));
    }

    const id = ++this.id;
    const payload = { jsonrpc: '2.0', id, method, params };

    console.log(
      `[SseMCPClient] Sending request ${id} to ${this.messageEndpoint}: ${JSON.stringify(payload)}`,
    );
    console.log(
      `[SseMCPClient] EventSource state: ${this.eventSource?.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSED)`,
    );

    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => {
        console.error(`[SseMCPClient] Request ${id} timed out after ${timeoutMs}ms`);
        console.error(
          `[SseMCPClient] Pending requests at timeout: ${Array.from(this.pending.keys()).join(', ')}`,
        );
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

      // Send request via POST to the message endpoint provided by server
      // rmcp uses session ID in query string, not as header
      fetch(this.messageEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
        .then(async (response) => {
          console.log(`[SseMCPClient] POST response: ${response.status}`);

          // If we get an error status, log the response body for debugging
          if (response.status >= 400) {
            try {
              const text = await response.text();
              console.error(`[SseMCPClient] Error response body:`, text);
            } catch (e) {
              console.error(`[SseMCPClient] Could not read error response body`);
            }
          }

          // Note: Per MCP SSE spec, the response comes via SSE stream, not HTTP response
          // We wait for the SSE event regardless of HTTP status
        })
        .catch((err) => {
          // Only reject on actual network/fetch errors, not HTTP status codes
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
    await this.rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: clientName, version },
    });
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
