import { Provider } from './types';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';
import { OllamaProvider } from './ollama';

export function createProvider(active: string | undefined, providers: any): Provider {
  switch (active) {
    case 'openai': return new OpenAIProvider(providers.openai);
    case 'anthropic': return new AnthropicProvider(providers.anthropic);
    case 'gemini': return new GeminiProvider(providers.gemini);
    case 'ollama': return new OllamaProvider(providers.ollama);
    default: throw new Error('No provider selected');
  }
}