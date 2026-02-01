# packages/chat

The `@stina/chat` package provides platform-neutral chat orchestration, streaming, and conversation management. It coordinates AI providers, message queuing, and persistence while remaining agnostic to the runtime environment.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      ChatSessionManager                          │
│              (Session lifecycle & settings sync)                 │
└─────────────────────────┬───────────────────────────────────────┘
                          │ creates/manages
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                       ChatOrchestrator                           │
│    ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│    │ MessageQueue│  │ConversationSvc│  │ ChatStreamService │    │
│    └──────┬──────┘  └──────┬───────┘  └─────────┬──────────┘    │
└───────────┼────────────────┼────────────────────┼───────────────┘
            │                │                    │
            ▼                ▼                    ▼
┌───────────────────┐ ┌─────────────────┐ ┌─────────────────────┐
│ ProviderRegistry  │ │  IConversation  │ │    AIProvider       │
│   (AI providers)  │ │   Repository    │ │  (streaming events) │
└───────────────────┘ └─────────────────┘ └─────────────────────┘
```

## ChatOrchestrator

The `ChatOrchestrator` is the central coordination point for chat functionality. It manages conversations, handles message queuing, coordinates with AI providers, and emits events during streaming.

### Design Pattern

The orchestrator follows the **Mediator pattern** - it coordinates interactions between multiple components without them needing direct references to each other:

- **ConversationService** - Business logic for conversations and interactions
- **ChatStreamService** - Processes streaming events from providers
- **ChatMessageQueue** - FIFO queue for pending messages
- **IConversationRepository** - Persistence abstraction
- **ProviderRegistry** - Access to AI providers

### Dependencies

```typescript
interface ChatOrchestratorDeps {
  userId?: string                           // User ID for tool context
  repository: IConversationRepository       // Persistence layer
  providerRegistry: ProviderRegistry        // AI providers
  settingsStore?: SettingsStore             // System prompt settings
  modelConfigProvider?: IModelConfigProvider // Model configuration
  toolRegistry?: ToolRegistry               // Available tools
  getToolDisplayName?: (toolId: string) => string | undefined
}
```

### Event System

The orchestrator emits events during the chat lifecycle:

```typescript
type OrchestratorEvent =
  | { type: 'thinking-update'; text: string }
  | { type: 'thinking-done' }
  | { type: 'content-update'; text: string }
  | { type: 'tool-start'; name: string }
  | { type: 'tool-complete'; tool: ToolCall }
  | { type: 'stream-complete'; messages: Message[] }
  | { type: 'stream-error'; error: Error }
  | { type: 'interaction-started'; interactionId: string; ... }
  | { type: 'interaction-saved'; interaction: Interaction }
  | { type: 'conversation-created'; conversation: Conversation }
  | { type: 'queue-update'; queue: QueueState }
  | { type: 'state-change' }
```

## ChatStreamService

The `ChatStreamService` processes streaming events from AI providers and accumulates them into final messages. It uses `eventemitter3` for browser compatibility.

### Stream Event Types

```typescript
type StreamEvent =
  | { type: 'thinking'; text: string }
  | { type: 'tool'; name: string; displayName?: string; payload: string }
  | { type: 'tool_result'; name: string; result: string }
  | { type: 'content'; text: string }
  | { type: 'done' }
  | { type: 'error'; error: Error }
```

### Event Flow

```
Provider Stream Events          ChatStreamService              Output
─────────────────────          ─────────────────              ──────
thinking: "Let me..."    ──►   accumulate thinking    ──►    'thinking-update'
thinking: " think"       ──►   accumulate thinking    ──►    'thinking-update'
tool: { name, payload }  ──►   mark thinking done     ──►    'thinking-done'
                               store active tool      ──►    'tool-start'
tool_result: { result }  ──►   complete tool          ──►    'tool-complete'
content: "Here's..."     ──►   accumulate content     ──►    'content-update'
done                     ──►   build final messages   ──►    'stream-complete'
```

## ConversationService

Pure business logic for managing conversations and interactions. Stateless operations that can be used anywhere.

```typescript
class ConversationService {
  createConversation(title?: string): Conversation
  createInteraction(conversationId: string): Interaction
  addMessage(interaction: Interaction, message: Message): void
  markCompleted(interaction: Interaction): void
  abortInteraction(interaction: Interaction): void
  archiveConversation(conversation: Conversation): void
}

// Singleton instance available
export const conversationService: ConversationService
```

## ProviderRegistry

Registry for AI providers. Providers register themselves to be discoverable by the chat system.

```typescript
class ProviderRegistry {
  register(provider: AIProvider): void    // Throws if ID exists
  get(id: string): AIProvider | undefined
  list(): AIProvider[]
  unregister(id: string): boolean
  has(id: string): boolean
  clear(): void
}

// Singleton instance available
export const providerRegistry: ProviderRegistry
```

### AIProvider Interface

```typescript
interface AIProvider {
  id: string      // e.g., 'anthropic', 'openai'
  name: string    // Display name

  sendMessage(
    messages: Message[],
    systemPrompt: string,
    onEvent: (event: StreamEvent) => void,
    options?: SendMessageOptions
  ): Promise<void>
}
```

## ChatSessionManager

Manages chat session lifecycle and handles settings synchronization. Critical for multi-session environments like the API server.

### Session Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                    ChatSessionManager                            │
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  Session A  │    │  Session B  │    │  Session C  │         │
│  │ orchestrator│    │ orchestrator│    │ orchestrator│         │
│  │ convId: x   │    │ convId: y   │    │ convId: z   │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│                                                                  │
│  conversationToSession: { x→A, y→B, z→C }                       │
└─────────────────────────────────────────────────────────────────┘
                          │
                          │ settings update detected
                          ▼
              broadcastSettingsUpdate()
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   enqueueMessage    enqueueMessage    enqueueMessage
   (settings-update) (settings-update) (settings-update)
```

### API Usage (Multi-user)

In the API server, each request gets or creates a session based on conversation ID:

```typescript
// apps/api/src/chat/chatSessionManager.ts
import { ChatSessionManager } from '@stina/chat'

const sessionManager = new ChatSessionManager(
  () => new ChatOrchestrator({
    repository: conversationRepository,
    providerRegistry: providerRegistry,
    settingsStore: appSettingsStore,
    toolRegistry: toolRegistry,
  }),
  { subscribeToSettings: true }
)

// In SSE handler
export async function handleChatStream(req, res) {
  const { conversationId, sessionId } = req.query

  // Get or create session (auto-creates orchestrator)
  const session = sessionManager.getSession({ sessionId, conversationId })

  // Register conversation mapping if new
  if (conversationId && session.conversationId !== conversationId) {
    sessionManager.registerConversation(session.id, conversationId)
  }

  // Use the orchestrator
  session.orchestrator.on('event', (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  })

  await session.orchestrator.sendMessage(message)
}
```

### Electron Usage (Single-user)

In Electron, typically one session per window:

```typescript
// apps/electron/src/main/chatManager.ts
import { ChatSessionManager, ChatOrchestrator } from '@stina/chat'

const sessionManager = new ChatSessionManager(
  () => new ChatOrchestrator({
    repository: conversationRepository,
    providerRegistry: providerRegistry,
    settingsStore: settingsStore,
    userId: currentUserId,
  }),
  { subscribeToSettings: true }
)

// IPC handler
ipcMain.handle('chat:send', async (event, { message, conversationId }) => {
  const session = sessionManager.getSession({ conversationId })

  session.orchestrator.on('event', (orchEvent) => {
    event.sender.send('chat:event', orchEvent)
  })

  await session.orchestrator.sendMessage(message)
})
```

## Settings Invalidation Pattern

When user settings that affect the system prompt change, all active sessions need to be notified. The `ChatSessionManager` handles this automatically.

### Monitored Settings

```typescript
type PromptSignatureSettings = {
  language: string
  firstName: string
  nickname: string
  personalityPreset: string
  customPersonalityPrompt: string  // Only when preset is 'custom'
}
```

### Flow

```
User changes settings
        │
        ▼
AppSettingsStore updated
        │
        ▼
onAppSettingsUpdated callback fires
        │
        ▼
ChatSessionManager.handleSettingsUpdate()
        │
        ├─► Compute prompt signature
        │
        ├─► Compare with lastPromptSignature
        │
        └─► If changed: broadcastSettingsUpdate()
                │
                ▼
        For each session:
          orchestrator.enqueueMessage('', 'instruction', undefined, 'settings-update')
```

The orchestrator then:
1. Detects the `settings-update` context
2. Includes updated system prompt with change prefix
3. Adds information message explaining what changed
4. Continues conversation with new personality

## IConversationRepository

Platform-neutral persistence interface. Implementations:
- **SQLite via Drizzle** - Used in Electron/API
- **Future: HTTP adapter** - For web clients

```typescript
interface IConversationRepository {
  saveConversation(conversation: Conversation): Promise<void>
  saveInteraction(interaction: Interaction): Promise<void>
  getConversation(id: string): Promise<Conversation | null>
  getLatestActiveConversation(): Promise<Conversation | null>
  getConversationInteractions(
    conversationId: string,
    limit: number,
    offset: number
  ): Promise<Interaction[]>
  countConversationInteractions(conversationId: string): Promise<number>
  archiveConversation(id: string): Promise<void>
  updateConversationTitle(id: string, title: string): Promise<void>
  updateConversationMetadata(id: string, metadata: Record<string, unknown>): Promise<void>
}
```

## Complete Example: Web App with SSE

```typescript
// Server-side: apps/api/src/routes/chat.ts
import { ChatSessionManager, ChatOrchestrator, providerRegistry } from '@stina/chat'

const sessionManager = new ChatSessionManager(() =>
  new ChatOrchestrator({
    repository: conversationRepository,
    providerRegistry: providerRegistry,
    settingsStore: settingsStore,
  })
)

app.get('/chat/stream', async (req, res) => {
  const { sessionId, conversationId, message } = req.query

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')

  const session = sessionManager.getSession({ sessionId, conversationId })

  session.orchestrator.on('event', (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  })

  try {
    await session.orchestrator.sendMessage(message as string)
    res.write('data: {"type":"done"}\n\n')
  } catch (error) {
    res.write(`data: {"type":"error","error":"${error.message}"}\n\n`)
  }

  res.end()
})
```

```typescript
// Client-side: packages/ui-vue/src/composables/useChat.ts
export function useChat() {
  const streamingContent = ref('')

  async function sendMessage(text: string, conversationId?: string) {
    const eventSource = new EventSource(
      `/api/chat/stream?message=${encodeURIComponent(text)}&conversationId=${conversationId}`
    )

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data)

      switch (data.type) {
        case 'content-update':
          streamingContent.value = data.text
          break
        case 'stream-complete':
          eventSource.close()
          break
      }
    }
  }

  return { streamingContent, sendMessage }
}
```

## Exports

```typescript
// Constants
export { STINA_NO_REPLY, getSystemPrompt }

// Types
export type { Message, Conversation, Interaction, AIProvider, StreamEvent, ... }

// Services
export { ConversationService, conversationService }
export { ChatStreamService }

// Providers
export { ProviderRegistry, providerRegistry }

// Orchestrator
export { ChatOrchestrator }
export { ChatSessionManager }
export type { IConversationRepository, ChatOrchestratorDeps, OrchestratorEvent, ... }

// Mappers
export { interactionToDTO, dtoToInteraction, messageToDTO, ... }

// Tools
export { ToolRegistry, toolRegistry }
```
