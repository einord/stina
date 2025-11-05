export type AiProviderName = "openai" | "anthropic" | "ollama" | "mock";

export interface AiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface AiResponseChunk {
  type: "text" | "tool-call" | "end";
  data?: string;
  toolCall?: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface AiProviderOptions {
  timeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  abortSignal?: AbortSignal;
}

export interface AiProviderConfig {
  name: AiProviderName;
}

export interface AiProvider<TConfig extends AiProviderConfig = AiProviderConfig> {
  readonly name: AiProviderName;
  readonly config: TConfig;
  streamChat(
    messages: AiMessage[],
    options?: AiProviderOptions
  ): AsyncIterable<AiResponseChunk>;
}
