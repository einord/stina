import { AiMessage, AiProvider, AiProviderOptions, AiResponseChunk } from "./types.js";

export interface MockConfig {
  name: "mock";
}

/**
 * Simple offline provider that echoes back user prompts.
 */
export class MockProvider implements AiProvider<MockConfig> {
  public readonly name = "mock" as const;

  constructor(public readonly config: MockConfig = { name: "mock" }) {}

  async *streamChat(
    messages: AiMessage[],
    _options?: AiProviderOptions
  ): AsyncIterable<AiResponseChunk> {
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    const text = lastUser
      ? `Mock response to: ${lastUser.content}`
      : "Mock provider is ready.";
    yield { type: "text", data: text };
    yield { type: "end" };
  }
}
