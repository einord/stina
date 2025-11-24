export { ChatManager } from './manager.js';
export { getChatRepository, appendToolMessage } from './repository.js';
export type { ChatSnapshot, Interaction, InteractionMessage, ChatRole } from './types.js';
export { chatTables, conversationsTable, interactionsTable, interactionMessagesTable } from './schema.js';
export type { StreamEvent, Provider as ChatProvider } from './manager.js';
