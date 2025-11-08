import { ChatMessage } from '@stina/store';

/**
 * Trims chat history to the last assistant/user messages after the most recent info entry.
 * Providers use this to keep prompts concise and avoid system chatter.
 */
export function toChatHistory(history: ChatMessage[]): ChatMessage[] {
  let start = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'info') {
      start = i + 1;
      break;
    }
  }
  return history
    .slice(start)
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-20);
}

/**
 * Parses tool-call argument strings into usable objects, tolerating malformed payloads.
 * @param raw Raw JSON string emitted by the provider.
 */
export function normalizeToolArgs(raw?: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') return { message: parsed };
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    return { value: parsed };
  } catch {
    return { message: raw };
  }
}
