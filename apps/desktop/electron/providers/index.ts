import { Provider } from './types.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { GeminiProvider } from './gemini.js';
import { OllamaProvider } from './ollama.js';

export function createProvider(active: string | undefined, providers: any): Provider {
  switch (active) {
    case 'openai': return new OpenAIProvider(providers.openai);
    case 'anthropic': return new AnthropicProvider(providers.anthropic);
    case 'gemini': return new GeminiProvider(providers.gemini);
    case 'ollama': return new OllamaProvider(providers.ollama);
    default: throw new Error('No provider selected');
  }
}