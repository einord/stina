import { AnthropicProvider, AnthropicConfig } from "./anthropicProvider.js";
import { MockConfig, MockProvider } from "./mockProvider.js";
import { OllamaConfig, OllamaProvider } from "./ollamaProvider.js";
import { OpenAiConfig, OpenAiProvider } from "./openaiProvider.js";
import { AiProvider, AiProviderConfig, AiProviderName } from "./types.js";

export type ProviderConfigMap = {
  openai: OpenAiConfig;
  anthropic: AnthropicConfig;
  ollama: OllamaConfig;
  mock: MockConfig;
};

export type AiProviderFactoryConfig = ProviderConfigMap[keyof ProviderConfigMap];

export const buildProvider = (
  config: AiProviderConfig
): AiProvider<AiProviderFactoryConfig> => {
  switch (config.name as AiProviderName) {
    case "openai":
      return new OpenAiProvider(config as OpenAiConfig);
    case "anthropic":
      return new AnthropicProvider(config as AnthropicConfig);
    case "ollama":
      return new OllamaProvider(config as OllamaConfig);
    case "mock":
      return new MockProvider(config as MockConfig);
    default:
      throw new Error(`Unknown AI provider: ${config.name}`);
  }
};
