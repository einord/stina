export type ChatRole = 'user' | 'assistant' | 'instructions' | 'info' | 'tool' | 'debug' | 'error';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  ts: number;
  aborted?: boolean;
};
