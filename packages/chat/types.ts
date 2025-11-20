import { type InferInsertModel, type InferSelectModel } from 'drizzle-orm';

import { interactionMessagesTable, interactionsTable } from './store.js';

// Exportera återanvändbara typer för tabellerna
export type Interaction = InferSelectModel<typeof interactionsTable>;
export type NewInteraction = InferInsertModel<typeof interactionsTable>;

export type InteractionMessage = InferSelectModel<typeof interactionMessagesTable>;
export type NewInteractionMessage = InferInsertModel<typeof interactionMessagesTable>;

// Define interaction message types
export const interactionMessageTypes = [
  'user',
  'assistant',
  'instructions',
  'info',
  'tool',
  'error',
] as const;
export type interactionMessageType = (typeof interactionMessageTypes)[number];

export interface userInteractionMessagesType {
  messageType: 'user';
  content: string;
}

export interface assistantInteractionMessagesType {
  messageType: 'assistant';
  content: string;
}

export interface InteractionMessageType {
  messageType: 'instructions';
  content: string;
}

export interface InfoInteractionMessageType {
  messageType: 'info';
  content: string;
}

export interface ToolInteractionMessageType {
  messageType: 'tool';
  toolName: string;
  parameters: Record<string, string>;
}

export interface ErrorInteractionMessageType {
  messageType: 'error';
  errorMessage: string;
}
