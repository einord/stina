export type ChatRole = 'user' | 'assistant' | 'instructions' | 'info' | 'tool' | 'debug' | 'error';

// export type ChatMessage = {
//   id: string;
//   role: ChatRole;
//   content: string;
//   ts: number;
//   aborted?: boolean;
//   conversationId: string;
// };

export type InteractionMessage = {
  id: string;
  interactionId: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  ts: number;
};

export type Interaction = {
  id: string;
  conversationId: string;
  ts: number;
  aborted?: boolean;
  messages: InteractionMessage[];
};

export type ChatMessage = InteractionMessage & { aborted?: boolean };
