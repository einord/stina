import type { ProviderConfigs, ProviderName } from '@stina/settings';

import { AnthropicProvider } from './anthropic.js';
import { GeminiProvider } from './gemini.js';
import { OllamaProvider } from './ollama.js';
import { OpenAIProvider } from './openai.js';
import { Provider } from './types.js';

export function createProvider(active: ProviderName | undefined, providers: ProviderConfigs): Provider {
  switch (active) {
    case 'openai':
      return new OpenAIProvider(providers?.openai);
    case 'anthropic':
      return new AnthropicProvider(providers?.anthropic);
    case 'gemini':
      return new GeminiProvider(providers?.gemini);
    case 'ollama':
      return new OllamaProvider(providers?.ollama);
    default:
      throw new Error('No provider selected');
  }
}

export type { Provider } from './types.js';
