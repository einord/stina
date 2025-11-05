import Anthropic from "@anthropic-ai/sdk";
import { AiMessage, AiProvider, AiProviderOptions, AiResponseChunk } from "./types.js";

export interface AnthropicConfig {
  name: "anthropic";
  apiKey: string;
  model: string;
  baseURL?: string;
}

export class AnthropicProvider implements AiProvider<AnthropicConfig> {
  public readonly name = "anthropic" as const;
  private readonly client: Anthropic;

  constructor(public readonly config: AnthropicConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseURL
    });
  }

  async *streamChat(
    messages: AiMessage[],
    options?: AiProviderOptions
  ): AsyncIterable<AiResponseChunk> {
    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: options?.maxTokens ?? 1024,
      temperature: options?.temperature,
      system: options?.systemPrompt,
      messages: messages.map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content
      })),
      stream: true
    });

    for await (const event of response) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "text", data: event.delta.text };
      }
    }

    yield { type: "end" };
  }
}
