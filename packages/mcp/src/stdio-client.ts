import { type ChildProcess, spawn } from 'node:child_process';
import { getDebugMode } from '@stina/settings';

import type { Json } from './client.js';

type JsonRpcResponse = {
  id?: number;
  result?: Json;
  error?: { message?: string } | null;
};

type Pending = { resolve: (v: Json) => void; reject: (e: Error) => void };

export interface StdioMCPClientOptions {
  args?: string;
  env?: Record<string, string>;
}

/**
 * JSON-RPC-over-stdio client for interacting with MCP servers via subprocess.
 * Spawns a child process and communicates via stdin/stdout.
 */
export class StdioMCPClient {
  private process?: ChildProcess;
  private id = 0;
  private pending = new Map<number, Pending>();
  private buffer = '';
  private isDebugMode = false;
  private env?: Record<string, string>;
  private lastStderr = '';
  private lastStdout = '';

  constructor(
    private command: string,
    private commandArgs?: string,
    options?: StdioMCPClientOptions,
  ) {
    this.env = options?.env;
  }

  /**
   * Spawns the subprocess and sets up stdio communication.
   * @param timeoutMs Milliseconds to wait before failing.
   */
  async connect(timeoutMs = 15000): Promise<void> {
    if (this.process && !this.process.killed) return;

    const parsedArgs = this.commandArgs ? this.commandArgs.trim().split(/\s+/) : [];
    const shouldShell = this.command.includes(' ') && parsedArgs.length === 0;
    const tokens = this.command.trim().split(/\s+/);
    const executable = shouldShell ? this.command : tokens[0];
    const args = shouldShell ? [] : [...tokens.slice(1), ...parsedArgs];

    this.isDebugMode = await getDebugMode();
    if (this.isDebugMode) {
      console.debug(`[StdioMCPClient] Spawning process: ${executable} ${args.join(' ')}`);
    }

    return new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('MCP stdio connect timeout')), timeoutMs);

      try {
        this.process = spawn(executable, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: this.env ? { ...process.env, ...this.env } : process.env,
          shell: shouldShell,
        });

        if (!this.process.stdout || !this.process.stdin) {
          clearTimeout(t);
          reject(new Error('Failed to create stdio streams'));
          return;
        }

        // Handle stdout data
        this.process.stdout.on('data', (chunk: Buffer) => {
          if (this.isDebugMode) {
            console.debug(`[StdioMCPClient] Received: ${chunk.toString('utf-8').trim()}`);
          }
          this.buffer += chunk.toString('utf-8');
          this.processBuffer();
        });

        // Handle errors
        this.process.on('error', (err) => {
          if (this.isDebugMode) {
            console.error(`[StdioMCPClient] Process error: ${err.message}`);
          }
          clearTimeout(t);
          reject(err);
        });

        // Handle exit
        this.process.on('exit', (code) => {
          if (this.isDebugMode) {
            console.debug(`[StdioMCPClient] Process exited with code ${code}`);
          }
          if (code !== 0) {
            const err = new Error(
              `MCP process exited with code ${code}${
                this.lastStderr ? `: ${this.lastStderr.trim()}` : ''
              }`,
            );
            this.pending.forEach((p) => p.reject(err));
            this.pending.clear();
          }
        });

        if (this.process.stderr) {
          this.process.stderr.on('data', (chunk: Buffer) => {
            const text = chunk.toString('utf-8');
            this.lastStderr = text;
            if (this.isDebugMode) {
              console.warn(`[StdioMCPClient] stderr: ${text.trim()}`);
            }
          });
        }

        // Consider connected immediately for stdio
        clearTimeout(t);
        resolve();
      } catch (err) {
        clearTimeout(t);
        reject(err);
      }
    });
  }

  /**
   * Processes buffered stdout data and extracts complete JSON-RPC messages.
   */
  private processBuffer() {
    // Support both MCP line-delimited JSON and Content-Length framed messages (LSP-style)
    while (this.buffer.length > 0) {
      const headerIndex = this.buffer.indexOf('\r\n\r\n');
      const altHeaderIndex = this.buffer.indexOf('\n\n');
      const hasContentLengthHeader =
        this.buffer.startsWith('Content-Length:') || this.buffer.startsWith('content-length:');

      if (hasContentLengthHeader && (headerIndex >= 0 || altHeaderIndex >= 0)) {
        const splitIndex = headerIndex >= 0 ? headerIndex : altHeaderIndex;
        const header = this.buffer.slice(0, splitIndex);
        const lenMatch = /Content-Length:\s*(\d+)/i.exec(header);
        if (!lenMatch) {
          // Drop malformed header
          this.buffer = this.buffer.slice(splitIndex + (headerIndex >= 0 ? 4 : 2));
          continue;
        }
        const length = Number(lenMatch[1]);
        const messageStart = splitIndex + (headerIndex >= 0 ? 4 : 2);
        if (this.buffer.length < messageStart + length) {
          // Wait for more data
          return;
        }
        const jsonStr = this.buffer.slice(messageStart, messageStart + length);
        this.buffer = this.buffer.slice(messageStart + length);
        const trimmed = jsonStr.trim();
        if (trimmed) this.lastStdout = trimmed;
        this.onMessage(trimmed);
        continue;
      }

      const newlineIndex = this.buffer.indexOf('\n');
      if (newlineIndex === -1) break; // wait for more data
      const line = this.buffer.slice(0, newlineIndex + 1);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      const trimmed = line.trim();
      if (trimmed) {
        this.lastStdout = trimmed;
        this.onMessage(trimmed);
      }
    }
  }

  /**
   * Handles inbound JSON-RPC messages and resolves pending promises.
   */
  private onMessage(data: string) {
    if (this.isDebugMode) {
      console.debug(`[StdioMCPClient] Parsed message: ${data.trim()}`);
    }
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
   * Sends a JSON-RPC request and returns a promise resolved with the result.
   */
  private rpc<T = Json>(method: string, params: Json, timeoutMs = 30000): Promise<T> {
    if (!this.process?.stdin) {
      return Promise.reject(new Error('MCP process not connected'));
    }

    const id = ++this.id;
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    if (this.isDebugMode) {
      console.debug(`[StdioMCPClient] Sending: ${payload.trim()}`);
    }

    this.process.stdin.write(payload);

    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => {
        this.pending.delete(id);
        const stderrInfo = this.lastStderr ? ` stderr: ${this.lastStderr.trim()}` : '';
        const stdoutInfo = this.lastStdout ? ` stdout: ${this.lastStdout.slice(-500)}` : '';
        reject(new Error(`MCP request timeout${stderrInfo || stdoutInfo ? ` (${stderrInfo}${stdoutInfo})` : ''}`));
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
    await this.sendNotification('notifications/initialized');
  }

  /**
   * Sends a JSON-RPC notification (no response expected).
   * Implements the MCP specification requirement for sending notifications
   * without expecting responses from the server.
   */
  private sendNotification(method: string, params?: Json): void {
    if (!this.process?.stdin) return;
    const payload = JSON.stringify({ jsonrpc: '2.0', method, ...(params && { params }) }) + '\n';
    this.process.stdin.write(payload);
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
    if (this.process && !this.process.killed) {
      this.process.kill();
      this.process = undefined;
    }
    this.pending.clear();
    this.buffer = '';
  }
}
