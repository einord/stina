import { AiMessage, AiProvider, AiProviderOptions, AiResponseChunk } from "./types.js";

export interface OllamaConfig {
  name: "ollama";
  host: string;
  model: string;
}

export class OllamaProvider implements AiProvider<OllamaConfig> {
  public readonly name = "ollama" as const;

  constructor(public readonly config: OllamaConfig) {}

  async *streamChat(
    messages: AiMessage[],
    options?: AiProviderOptions
  ): AsyncIterable<AiResponseChunk> {
    const response = await fetch(new URL("/api/chat", this.config.host), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: true,
        options: {
          temperature: options?.temperature,
          num_predict: options?.maxTokens
        }
      }),
      signal: options?.abortSignal
    });

    if (!response.ok || !response.body) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        if (!part.trim()) continue;
        const parsed = JSON.parse(part);
        if (parsed?.message?.content) {
          yield { type: "text", data: parsed.message.content };
        }
        if (parsed?.done) {
          yield { type: "end" };
        }
      }
    }

    yield { type: "end" };
  }
}
