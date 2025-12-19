export { ChatManager } from './manager.js';
export { getChatRepository, appendToolMessage } from './repository.js';
export type { ChatSnapshot, Interaction, InteractionMessage, ChatRole } from './types.js';
export { chatTables, conversationsTable, interactionsTable, interactionMessagesTable } from './schema.js';
export type { StreamEvent, QueueState, Provider as ChatProvider, Provider } from './manager.js';
export { groupToolMessages } from './messageGrouping.js';
export type { ToolMessageGroup } from './messageGrouping.js';
