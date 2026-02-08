/**
 * IPC handler modules for Electron main process.
 *
 * Split into domain-specific modules:
 * - types.ts — Shared types and event infrastructure
 * - auth.ts — External browser authentication
 * - connection.ts — Connection configuration and testing
 * - notifications.ts — System notifications
 *
 * The main registerIpcHandlers function remains in the parent ipc.ts
 * due to its shared closure state (repos, session manager, etc.).
 */

export type { ChatEvent, ChatStreamEvent } from './types.js'
export { emitChatEvent, onChatEvent, conversationEventBus, pendingConfirmationStore } from './types.js'
export { registerNotificationIpcHandlers } from './notifications.js'
export { registerConnectionIpcHandlers } from './connection.js'
export { registerAuthIpcHandlers } from './auth.js'
