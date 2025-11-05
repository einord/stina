import OpenAI from "openai";
import { AiMessage, AiProvider, AiProviderOptions, AiResponseChunk } from "./types.js";

export interface OpenAiConfig {
  name: "openai";
  apiKey: string;
  baseURL?: string;
  model: string;
}

export class OpenAiProvider implements AiProvider<OpenAiConfig> {
  public readonly name = "openai" as const;
  public readonly client: OpenAI;

  constructor(public readonly config: OpenAiConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL
    });
  }

  async *streamChat(
    messages: AiMessage[],
    options?: AiProviderOptions
  ): AsyncIterable<AiResponseChunk> {
    // Map to OpenAI chat messages, ignoring unsupported 'tool' role for now
    const chatMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = messages
      .filter((m) => m.role === "system" || m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "system" | "user" | "assistant", content: m.content }));

    const stream = await this.client.chat.completions.create({
      model: this.config.model,
      stream: true,
      temperature: options?.temperature,
      max_tokens: options?.maxTokens ?? undefined,
      messages: chatMessages
    });

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        yield { type: "text", data: content };
      }
    }

    yield { type: "end" };
  }
}
