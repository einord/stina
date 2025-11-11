export type ChatRole = 'user' | 'assistant' | 'info' | 'tool' | 'debug';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  ts: number;
  aborted?: boolean;
};
