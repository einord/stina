export type ChatRole = 'user' | 'assistant' | 'instructions' | 'info' | 'tool' | 'debug' | 'error';

export type Interaction = {
  id: string;
  conversationId: string;
  ts: number;
  aborted: boolean;
  messages: InteractionMessage[];
};

export type InteractionMessage = {
  id: string;
  interactionId: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  ts: number;
  provider?: string;
};

export type ChatMessage = InteractionMessage & { aborted?: boolean };
