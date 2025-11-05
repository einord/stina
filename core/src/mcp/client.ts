import EventEmitter from "node:events";
import WebSocket from "ws";

interface McpClientOptions {
  url: string;
  token?: string;
}

interface McpRequest {
  type: "invoke";
  id: string;
  tool: string;
  args: Record<string, unknown>;
}

interface McpResponse {
  id: string;
  status: "ok" | "error";
  data?: unknown;
  error?: string;
}

export class McpClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private counter = 0;
  private pending = new Map<string, (response: McpResponse) => void>();

  constructor(private readonly options: McpClientOptions) {
    super();
  }

  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    this.ws = new WebSocket(this.options.url, {
      headers: this.options.token ? { Authorization: `Bearer ${this.options.token}` } : undefined
    });

    await new Promise<void>((resolve, reject) => {
      if (!this.ws) {
        reject(new Error("WebSocket not initialised"));
        return;
      }
      this.ws.once("open", () => resolve());
      this.ws.once("error", (error) => reject(error));
    });

    this.ws.on("message", (data) => this.handleMessage(data.toString()));
    this.ws.on("error", (error) => this.emit("error", error));
    this.ws.on("close", () => this.emit("close"));
  }

  private handleMessage(data: string): void {
    try {
      const parsed: McpResponse = JSON.parse(data);
      const handler = this.pending.get(parsed.id);
      if (handler) {
        handler(parsed);
        this.pending.delete(parsed.id);
      } else {
        this.emit("message", parsed);
      }
    } catch (error) {
      this.emit("error", error);
    }
  }

  async invoke(tool: string, args: Record<string, unknown>): Promise<McpResponse> {
    await this.connect();
    const id = `req_${++this.counter}`;
    const request: McpRequest = { type: "invoke", id, tool, args };
    const ws = this.ws;
    if (!ws) {
      throw new Error("WebSocket connection missing");
    }

    const responsePromise = new Promise<McpResponse>((resolve, reject) => {
      this.pending.set(id, (response) => {
        if (response.status === "error") {
          reject(new Error(response.error ?? "Unknown MCP error"));
        } else {
          resolve(response);
        }
      });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP invoke timeout: ${tool}`));
        }
      }, 30_000);
    });

    ws.send(JSON.stringify(request));
    return responsePromise;
  }
}
