import { ChatMessage } from '@stina/store';

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

export function normalizeToolArgs(raw?: string | null): any {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') return { message: parsed };
    if (parsed && typeof parsed === 'object') return parsed;
    return { value: parsed };
  } catch {
    return { message: raw };
  }
}
