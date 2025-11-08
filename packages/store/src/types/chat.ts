export type ChatRole = 'user' | 'assistant' | 'info' | 'tool';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  ts: number;
  aborted?: boolean;
};
