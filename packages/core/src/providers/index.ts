import type { ProviderConfigs, ProviderName } from '@stina/settings';

import { ChatMessage } from '../../../store/src/types/chat.js';

import { AnthropicProvider } from './anthropic.js';
import { GeminiProvider } from './gemini.js';
import { OllamaProvider } from './ollama.js';
import { OpenAIProvider } from './openai.js';
import { Provider } from './types.js';

/**
 * Instantiates the configured provider implementation based on the active name.
 * Throws if no provider is active so callers can surface the issue to the user.
 * @param active Provider chosen in settings.
 * @param providers Full provider configuration map.
 */
export function createProvider(
  active: ProviderName | undefined,
  providers: ProviderConfigs,
): Provider {
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

/**
 * Filters chat messages to only include those important to send to the AI providers.
 * @param messages The unfiltered list of messages.
 * @returns The filtered list of messages.
 */
export const filterChatMessagesToProvider = (messages: ChatMessage[]): ChatMessage[] => {
  return messages.filter(
    (m) => m.role === 'user' || m.role === 'assistant' || m.role === 'instructions',
  );
};
