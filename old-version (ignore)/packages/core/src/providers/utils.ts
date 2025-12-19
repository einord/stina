import type { InteractionMessage } from '@stina/chat';

/**
 * Trims chat history to the messages within the current conversation id.
 * Providers use this to keep prompts concise and avoid system chatter.
 */
export function toChatHistory(history: InteractionMessage[]): InteractionMessage[] {
  return history.filter(
    (m) => m.role === 'user' || m.role === 'assistant' || m.role === 'instructions',
  );
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
