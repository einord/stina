/**
 * Re-export from the chat/ module for backwards compatibility.
 * The implementation has been split into:
 * - chat/eventBroadcaster.ts — Event types, emitter, writers
 * - chat/sessionManager.ts — Session management, mutex, cleanup
 * - chat/index.ts — Route definitions
 */
export {
  chatStreamRoutes,
  emitChatEvent,
  onChatEvent,
  registerWriter,
  unregisterWriter,
  invalidateUserSessionManager,
  queueInstructionForUser,
} from './chat/index.js'

export type {
  ChatEvent,
  ChatEventWriter,
} from './chat/index.js'
