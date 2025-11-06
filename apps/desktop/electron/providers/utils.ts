import { ChatMessage } from '@stina/store';

export function toChatHistory(history: ChatMessage[]): ChatMessage[] {
  let start = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'info') { start = i + 1; break; }
  }
  return history
    .slice(start)
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-20);
}