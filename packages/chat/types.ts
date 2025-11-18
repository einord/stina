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
