# ChatSessionManager Pattern

The `ChatSessionManager` is responsible for managing chat session lifecycles, mapping conversation IDs to sessions, supporting parallel conversations, and handling settings updates.

## Purpose

1. **Keep Orchestrator Alive** - Reuse orchestrator instances across requests for the same conversation
2. **Map conversationId to Sessions** - Efficiently lookup sessions by either sessionId or conversationId
3. **Support Parallel Conversations** - Multiple conversations can be active simultaneously
4. **Handle Settings Updates** - Automatically broadcast settings changes to all active sessions

## Location in Codebase

```
packages/chat/src/sessions/chatSessionManager.ts
```

Exported from `@stina/chat`:

```typescript
import { ChatSessionManager } from '@stina/chat'
```

## Usage in API (apps/api/src/routes/chatStream.ts)

The API server maintains a per-user session manager map at module level:

```typescript
import { ChatSessionManager, ChatOrchestrator, providerRegistry, toolRegistry } from '@stina/chat'
import { ConversationRepository, UserSettingsRepository, AppSettingsStore } from '@stina/chat/db'

// Map to hold session managers per user
const userSessionManagers = new Map<string, ChatSessionManager>()

// Mutex to synchronize access (prevents race conditions)
const sessionManagerMutex = new AsyncMutex()

/**
 * Get or create a session manager for a user.
 */
async function getOrCreateSessionManager(userId: string): Promise<ChatSessionManager> {
  return sessionManagerMutex.acquire(userId, async () => {
    let manager = userSessionManagers.get(userId)
    if (!manager) {
      const repository = new ConversationRepository(db, userId)
      const userSettingsRepo = new UserSettingsRepository(db, userId)
      const userSettings = await userSettingsRepo.get()
      const settingsStore = new AppSettingsStore(userSettings)

      const modelConfigProvider = {
        async getDefault() {
          const defaultModelId = await userSettingsRepo.getDefaultModelConfigId()
          if (!defaultModelId) return null
          const config = await modelConfigRepo.get(defaultModelId)
          if (!config) return null
          return {
            providerId: config.providerId,
            modelId: config.modelId,
            settingsOverride: config.settingsOverride,
          }
        },
      }

      manager = new ChatSessionManager(
        () =>
          new ChatOrchestrator(
            {
              userId,
              repository,
              providerRegistry,
              modelConfigProvider,
              toolRegistry,
              settingsStore,
            },
            { pageSize: 10 }
          )
      )
      userSessionManagers.set(userId, manager)
    }
    return manager
  })
}

// In SSE stream handler
fastify.post('/chat/stream', async (request, reply) => {
  const { conversationId, sessionId, message, queueId } = request.body
  const userId = request.user.id

  const sessionManager = await getOrCreateSessionManager(userId)
  const session = sessionManager.getSession({ sessionId, conversationId })
  const orchestrator = session.orchestrator

  orchestrator.on('event', (event) => {
    if (event.type === 'conversation-created') {
      // Register new conversation mapping
      sessionManager.registerConversation(session.id, event.conversation.id)
    }
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
  })

  if (conversationId && orchestrator.conversation?.id !== conversationId) {
    await orchestrator.loadConversation(conversationId)
  }

  await orchestrator.enqueueMessage(message, 'user', queueId)
})
```

## Usage in Electron Main (apps/electron/src/main/ipc.ts)

Electron uses a single session manager instance (single-user environment):

```typescript
import { ChatSessionManager, ChatOrchestrator, providerRegistry, toolRegistry } from '@stina/chat'
import { ConversationRepository, getAppSettingsStore } from '@stina/chat/db'

let chatSessionManager: ChatSessionManager | null = null

const getChatSessionManager = (): ChatSessionManager => {
  if (chatSessionManager) {
    return chatSessionManager
  }

  const settingsStore = getAppSettingsStore()
  const conversationRepo = new ConversationRepository(db, defaultUserId)
  const modelConfigRepo = new ModelConfigRepository(db)
  const userSettingsRepo = new UserSettingsRepository(db, defaultUserId)

  const modelConfigProvider = {
    async getDefault() {
      const defaultModelId = await userSettingsRepo.getDefaultModelConfigId()
      if (!defaultModelId) return null
      const config = await modelConfigRepo.get(defaultModelId)
      if (!config) return null
      return {
        providerId: config.providerId,
        modelId: config.modelId,
        settingsOverride: config.settingsOverride,
      }
    },
  }

  chatSessionManager = new ChatSessionManager(
    () =>
      new ChatOrchestrator(
        {
          repository: conversationRepo,
          providerRegistry,
          modelConfigProvider,
          toolRegistry,
          settingsStore,
        },
        { pageSize: 10 }
      ),
    { subscribeToSettings: true }
  )

  return chatSessionManager
}

// IPC handler for streaming messages
ipcMain.handle('chat-stream-message', async (event, conversationId, message, options) => {
  const { queueId, sessionId } = options
  const sessionManager = getChatSessionManager()
  const session = sessionManager.getSession({ sessionId, conversationId })
  const orchestrator = session.orchestrator

  orchestrator.on('event', (orcEvent) => {
    if (orcEvent.type === 'conversation-created') {
      sessionManager.registerConversation(session.id, orcEvent.conversation.id)
    }
    event.sender.send('chat-stream-event', transformEvent(orcEvent))
  })

  if (conversationId && orchestrator.conversation?.id !== conversationId) {
    await orchestrator.loadConversation(conversationId)
  }

  await orchestrator.enqueueMessage(message, 'user', queueId)
  return { success: true }
})
```

## Key Methods

### getSession(params)

Gets an existing session or creates a new one. Returns a `ChatSession` object.

```typescript
interface ChatSession {
  id: string
  orchestrator: ChatOrchestrator
  conversationId?: string
  lastUsedAt: number
}

const session = sessionManager.getSession({ sessionId, conversationId })
```

### findSession(params)

Finds an existing session without creating one. Returns `null` if not found.

```typescript
const session = sessionManager.findSession({ sessionId, conversationId })
if (!session) {
  return { error: 'Session not found' }
}
```

### registerConversation(sessionId, conversationId)

Maps a conversation ID to a session. Called after a new conversation is created.

```typescript
orchestrator.on('event', (event) => {
  if (event.type === 'conversation-created') {
    sessionManager.registerConversation(session.id, event.conversation.id)
  }
})
```

### removeSession(sessionId)

Removes a session and its conversation mapping.

```typescript
sessionManager.removeSession(session.id)
```

### destroyAllSessions()

Destroys all sessions and cleans up. Used when user settings change significantly.

```typescript
sessionManager.destroyAllSessions()
```

## Settings Invalidation Pattern

When user settings affecting the system prompt change, the session manager must be invalidated:

```typescript
// In settings route handler
export async function invalidateUserSessionManager(userId: string): Promise<void> {
  await sessionManagerMutex.acquire(userId, async () => {
    const manager = userSessionManagers.get(userId)
    if (manager) {
      manager.destroyAllSessions()
      userSessionManagers.delete(userId)
    }
  })
}

// Settings update endpoint
fastify.put('/settings', async (request, reply) => {
  const userId = request.user.id
  const updated = await userSettingsRepo.update(request.body)

  // Invalidate session manager so next request gets fresh settings
  await invalidateUserSessionManager(userId)

  return updated
})
```

The session manager also auto-broadcasts settings updates to active sessions:

```typescript
// Internal: ChatSessionManager monitors these settings
type PromptSignatureSettings = {
  language: string
  firstName: string
  nickname: string
  personalityPreset: string
  customPersonalityPrompt: string  // Only when preset is 'custom'
}

// When these change, all sessions receive a 'settings-update' context message
private broadcastSettingsUpdate(): void {
  for (const session of this.sessions.values()) {
    session.orchestrator.enqueueMessage('', 'instruction', undefined, 'settings-update')
  }
}
```

## Session Lifecycle Diagram

```
                          Request arrives
                                │
                                ▼
                    ┌───────────────────────┐
                    │ getSession({          │
                    │   sessionId?,         │
                    │   conversationId?     │
                    │ })                    │
                    └───────────┬───────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
              ▼                 ▼                 ▼
      ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
      │ Found by    │   │ Found by    │   │ Not found   │
      │ sessionId   │   │ conversationId  │ create new  │
      └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
              │                 │                 │
              └─────────────────┼─────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │ Update lastUsedAt     │
                    │ Return session        │
                    └───────────┬───────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │ Use orchestrator      │
                    │ Subscribe to events   │
                    │ Send message          │
                    └───────────┬───────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │ On 'conversation-     │
                    │ created' event:       │
                    │ registerConversation()│
                    └───────────────────────┘


              Settings Update Flow
              ════════════════════

    User changes settings
              │
              ▼
    AppSettingsStore updated
              │
              ▼
    onAppSettingsUpdated() fires
              │
              ▼
    ┌─────────────────────────────────┐
    │ ChatSessionManager              │
    │ handleSettingsUpdate()          │
    │                                 │
    │ 1. Compute prompt signature     │
    │ 2. Compare with last signature  │
    │ 3. If changed: broadcast        │
    └─────────────────┬───────────────┘
                      │
                      ▼
    ┌─────────────────────────────────┐
    │ broadcastSettingsUpdate()       │
    │                                 │
    │ For each session:               │
    │   orchestrator.enqueueMessage(  │
    │     '', 'instruction',          │
    │     undefined, 'settings-update'│
    │   )                             │
    └─────────────────────────────────┘
```
