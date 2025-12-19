import { type InferInsertModel, type InferSelectModel } from 'drizzle-orm';

import { chatRoles } from './constants.js';
import { interactionMessagesTable, interactionsTable, conversationsTable } from './schema.js';

export type ChatRole = (typeof chatRoles)[number];

export type Conversation = InferSelectModel<typeof conversationsTable>;
export type NewConversation = InferInsertModel<typeof conversationsTable>;

export type Interaction = InferSelectModel<typeof interactionsTable> & {
  messages: InteractionMessage[];
};
export type NewInteraction = InferInsertModel<typeof interactionsTable>;

export type InteractionMessage = InferSelectModel<typeof interactionMessagesTable> & {
  content: string;
};
export type NewInteractionMessage = InferInsertModel<typeof interactionMessagesTable> & {
  content: string;
};

export type ChatSnapshot = {
  conversation: Conversation;
  interactions: Interaction[];
};

export type ChatEvent =
  | { kind: 'conversation'; id: string }
  | { kind: 'message'; conversationId: string; interactionId: string }
  | { kind: 'snapshot' };
