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
  conversationId: string;
  role: ChatRole;
  content: string;
  ts: number;
};

export type Interaction = {
  id: string;
  ts: number;
  content: InteractionMessage[];
};
