# Signal Flow and Context Propagation Patterns

This document describes how signals flow between clients (web/electron/CLI) and how context objects and userId information propagate through the Stina system.

---

## Overview: Data Flow Architecture

The architecture maintains strict separation between Browser and Node.js layers, with clear context propagation at each boundary.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER LAYER                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         UI (Vue Components)                          │    │
│  │    ChatInput.vue  ──►  ChatView.service.ts  ──►  ApiClient           │    │
│  └────────────────────────────────┬────────────────────────────────────┘    │
│                                   │                                          │
│                    ┌──────────────┴──────────────┐                          │
│                    │                             │                           │
│               [Web: HTTP/SSE]             [Electron: IPC]                   │
└────────────────────┼─────────────────────────────┼──────────────────────────┘
                     │                             │
┌────────────────────┼─────────────────────────────┼──────────────────────────┐
│                    ▼                             ▼                           │
│  ┌─────────────────────────┐     ┌─────────────────────────────────┐        │
│  │      apps/api           │     │    apps/electron (main)          │        │
│  │   chatStream.ts         │     │         ipc.ts                   │        │
│  │  ┌───────────────────┐  │     │  ┌───────────────────────────┐  │        │
│  │  │ SessionManager    │  │     │  │ SessionManager            │  │        │
│  │  │  └─ userId        │  │     │  │  └─ userId                │  │        │
│  │  │  └─ orchestrator  │  │     │  │  └─ orchestrator          │  │        │
│  │  └───────────────────┘  │     │  └───────────────────────────┘  │        │
│  └────────────┬────────────┘     └──────────────┬──────────────────┘        │
│               │                                 │                            │
│               └────────────────┬────────────────┘                            │
│                                ▼                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      ChatOrchestrator                                 │   │
│  │   deps: { userId, repository, providerRegistry, toolRegistry }        │   │
│  │                                                                        │   │
│  │   ┌──────────────┐     ┌──────────────┐     ┌──────────────────┐     │   │
│  │   │  AI Provider │ ◄─► │ Tool Executor│ ◄─► │ ExtensionHost    │     │   │
│  │   │  (streaming) │     │  (userId)    │     │ (Worker Threads) │     │   │
│  │   └──────────────┘     └──────────────┘     └──────────────────┘     │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    NODE.JS LAYER                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Context Types

The system uses different context types at different layers to propagate user identity and execution metadata.

### ChatOrchestratorDeps (packages/chat)

Injected when creating a ChatOrchestrator instance. Contains userId for the session and all dependencies:

```typescript
interface ChatOrchestratorDeps {
  userId?: string                     // User ID for tool execution context
  repository: IConversationRepository // User-scoped repository instance
  providerRegistry: ProviderRegistry  // Available AI providers
  modelConfigProvider: ModelConfigProvider
  settingsStore?: SettingsStore       // User settings access
  toolRegistry?: ToolRegistry         // Available tools (built-in + extension)
}
```

**Where created:**
- `apps/api/src/routes/chatStream.ts` - per-user SessionManager
- `apps/electron/src/main/ipc.ts` - single default user
- `apps/tui/src/commands/chat.ts` - direct instantiation

### ToolExecutionContext (packages/chat)

Passed to every tool when executed, providing user context for tool logic:

```typescript
interface ToolExecutionContext {
  timezone?: string  // User's timezone from settings (e.g., "Europe/Stockholm")
  userId?: string    // User ID for user-scoped operations
}
```

**Where created:** Inside `ChatOrchestrator` when executing tools, populated from `deps.userId` and user settings.

### ExecutionContext (packages/extension-api)

The richest context type, passed to extension tools, actions, scheduler callbacks, and background tasks:

```typescript
interface ExecutionContext {
  readonly userId?: string  // Always defined for tool/action execution
  readonly extension: {
    readonly id: string           // Extension identifier
    readonly version: string      // Extension version
    readonly storagePath: string  // Local storage directory
  }
  // Storage APIs (collection-based document storage)
  readonly storage: StorageAPI      // Extension-scoped storage (shared across users)
  readonly userStorage: StorageAPI  // User-scoped storage (isolated per userId)
  // Secrets APIs (encrypted credential storage)
  readonly secrets: SecretsAPI      // Extension-scoped secrets
  readonly userSecrets: SecretsAPI  // User-scoped secrets (isolated per userId)
}
```

**Storage API interface:**

```typescript
interface StorageAPI {
  put<T extends object>(collection: string, id: string, data: T): Promise<void>
  get<T>(collection: string, id: string): Promise<T | undefined>
  delete(collection: string, id: string): Promise<boolean>
  find<T>(collection: string, query?: Query, options?: QueryOptions): Promise<T[]>
  findOne<T>(collection: string, query: Query): Promise<T | undefined>
  count(collection: string, query?: Query): Promise<number>
  putMany<T extends object>(collection: string, docs: Array<{ id: string; data: T }>): Promise<void>
  deleteMany(collection: string, query: Query): Promise<number>
  dropCollection(collection: string): Promise<void>
  listCollections(): Promise<string[]>
}
```

**Secrets API interface:**

```typescript
interface SecretsAPI {
  set(key: string, value: string): Promise<void>
  get(key: string): Promise<string | undefined>
  delete(key: string): Promise<boolean>
  list(): Promise<string[]>
}
```

---

## Flow Diagrams

### Scenario 1: User Sends Chat Message (Web)

Complete flow from UI input to streaming response:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. USER INPUT                                                             │
│    ChatInput.vue → emits 'submit' with message text                       │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 2. SERVICE LAYER                                                          │
│    ChatView.service.ts:                                                   │
│    - Creates SSE connection to POST /chat/stream                          │
│    - Sends: { message, conversationId }                                   │
│    - Auth header contains JWT with userId                                 │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │ HTTP + SSE
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 3. API ROUTE (apps/api/src/routes/chatStream.ts)                          │
│                                                                           │
│    const userId = request.user!.id  // From JWT via requireAuth           │
│    const sessionManager = await getSessionManager(userId)                 │
│    const session = sessionManager.getSession({ conversationId })          │
│    const orchestrator = session.orchestrator  // Has userId in deps       │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 4. ORCHESTRATOR (packages/chat)                                           │
│                                                                           │
│    orchestrator.enqueueMessage(message, 'user', queueId)                  │
│      → Creates Interaction                                                │
│      → Emits 'interaction-started'                                        │
│      → Calls provider.sendMessage(messages, systemPrompt, callback)       │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
              ┌──────────────────────┴──────────────────────┐
              │                                             │
              ▼                                             ▼
┌─────────────────────────────┐          ┌─────────────────────────────────┐
│ 5a. AI PROVIDER             │          │ 5b. TOOL EXECUTION (if needed)   │
│     (Streaming response)    │          │                                  │
│                             │          │   toolExecutor(toolId, params)   │
│ Emits:                      │          │     → toolRegistry.get(toolId)   │
│ - 'thinking-update'         │          │     → executionContext = {       │
│ - 'content-update'          │          │         timezone,                │
│ - 'tool-start'              │          │         userId: deps.userId      │
│ - 'tool-complete'           │          │       }                          │
│ - 'done'                    │          │     → tool.execute(params, ctx)  │
└─────────────────────────────┘          └───────────────┬─────────────────┘
                                                         │
                                                         ▼
                                         ┌─────────────────────────────────┐
                                         │ 5c. EXTENSION HOST              │
                                         │     (If tool is from extension) │
                                         │                                 │
                                         │ sendToWorker({                  │
                                         │   type: 'tool-execute-request', │
                                         │   payload: {                    │
                                         │     toolId,                     │
                                         │     params,                     │
                                         │     userId  // Propagated!      │
                                         │   }                             │
                                         │ })                              │
                                         └─────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 6. EVENTS STREAM BACK                                                     │
│                                                                           │
│    orchestrator.on('event', (event) => {                                  │
│      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)                │
│    })                                                                     │
│                                                                           │
│    Events: interaction-started → thinking-update → content-update →       │
│            tool-start → tool-complete → stream-complete →                 │
│            interaction-saved                                              │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │ SSE
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 7. UI UPDATES                                                             │
│                                                                           │
│    ChatView.service.ts parses SSE events                                  │
│      → Updates reactive state (streamingContent, etc.)                    │
│      → Vue components re-render automatically                             │
└──────────────────────────────────────────────────────────────────────────┘
```

### Scenario 2: Scheduled Job Triggers Chat (Extension)

Extension scheduler fires and sends instruction to chat:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. SCHEDULER FIRES                                                        │
│                                                                           │
│    SchedulerService detects job is due                                    │
│    Job was created with: { userId: "user-123", ... }                      │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 2. EXTENSION HOST NOTIFIES WORKER                                         │
│                                                                           │
│    sendToWorker({                                                         │
│      type: 'scheduler-fire',                                              │
│      payload: {                                                           │
│        id: jobId,                                                         │
│        userId: "user-123",  // From job definition                        │
│        scheduledFor, firedAt, delayMs                                     │
│      }                                                                    │
│    })                                                                     │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 3. EXTENSION CALLBACK                                                     │
│                                                                           │
│    // In extension worker (runtime.ts)                                    │
│    scheduler.onFire((payload, context) => {                               │
│      // context.userId = "user-123"                                       │
│      // context.userStorage available for user-scoped data                │
│                                                                           │
│      // Send instruction to chat:                                         │
│      await chat.appendInstruction({                                       │
│        text: "Reminder: Check your tasks",                                │
│        userId: context.userId,                                            │
│        conversationId: prefs.defaultConversationId                        │
│      })                                                                   │
│    })                                                                     │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 4. CHAT API (via extension bridge)                                        │
│                                                                           │
│    // chatStream.ts or electron/main/index.ts                             │
│    queueInstructionForUser(userId, message, conversationId)               │
│      → Gets/creates SessionManager for userId                             │
│      → orchestrator.enqueueMessage(message, 'instruction')                │
│      → Emits chat-event: { type: 'instruction-received', userId }         │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 5. NOTIFICATION TO CLIENTS                                                │
│                                                                           │
│    // All clients subscribed to GET /chat/events receive:                 │
│    emitChatEvent({                                                        │
│      type: 'instruction-received',                                        │
│      userId: "user-123",                                                  │
│      conversationId: "conv-456"                                           │
│    })                                                                     │
│                                                                           │
│    // Only clients with matching userId process the event                 │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 6. UI NOTIFICATION                                                        │
│                                                                           │
│    // chatEventClient.ts receives event                                   │
│    // Triggers notification if window not focused                         │
│    NotificationService.notify({                                           │
│      title: "New message",                                                │
│      body: "Reminder: Check your tasks"                                   │
│    })                                                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

### Scenario 3: Electron IPC Flow

Electron main process handles chat directly without HTTP:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. RENDERER PROCESS (Vue)                                                 │
│                                                                           │
│    // Uses IPC-based ApiClient                                            │
│    window.stina.chat.streamMessage(conversationId, message)               │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │ IPC (contextBridge)
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 2. PRELOAD BRIDGE                                                         │
│                                                                           │
│    // preload/index.ts exposes safe API                                   │
│    contextBridge.exposeInMainWorld('stina', {                             │
│      chat: {                                                              │
│        streamMessage: (convId, msg) =>                                    │
│          ipcRenderer.invoke('chat-stream-message', convId, msg)           │
│      }                                                                    │
│    })                                                                     │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │ IPC invoke
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 3. MAIN PROCESS (apps/electron/src/main/ipc.ts)                           │
│                                                                           │
│    ipcMain.handle('chat-stream-message', async (event, convId, msg) => {  │
│      const userId = defaultUserId  // Electron has single user            │
│      const session = sessionManager.getSession({ conversationId })        │
│      const orchestrator = session.orchestrator                            │
│                                                                           │
│      orchestrator.on('event', (orcEvent) => {                             │
│        // Transform and send to renderer                                  │
│        sender.send('chat-stream-event', transformedEvent)                 │
│      })                                                                   │
│                                                                           │
│      await orchestrator.enqueueMessage(msg, 'user', queueId)              │
│    })                                                                     │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │ IPC send
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 4. RENDERER RECEIVES EVENTS                                               │
│                                                                           │
│    ipcRenderer.on('chat-stream-event', (event, data) => {                 │
│      // Update reactive state, same as Web SSE flow                       │
│    })                                                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Message Protocol: Host ↔ Extension Worker

Extensions run in isolated Worker Threads. Communication uses a typed message protocol.

### Host → Worker Messages

| Message Type              | Purpose                           | userId Included |
| ------------------------- | --------------------------------- | --------------- |
| `activate`                | Initialize extension              | No              |
| `deactivate`              | Shutdown extension gracefully     | No              |
| `scheduler-fire`          | Scheduled job triggered           | Yes             |
| `tool-execute-request`    | Execute a registered tool         | Yes             |
| `action-execute-request`  | Execute a registered action       | Yes             |
| `provider-chat-request`   | Request chat completion           | No              |
| `settings-changed`        | Extension setting value updated   | No              |
| `event`                   | Custom event from another ext     | Varies          |

### Worker → Host Messages

| Message Type              | Purpose                           |
| ------------------------- | --------------------------------- |
| `ready`                   | Worker initialized successfully   |
| `provider-registered`     | AI provider available for use     |
| `tool-registered`         | Tool available for AI             |
| `action-registered`       | Action available for UI           |
| `tool-execute-response`   | Tool execution result             |
| `action-execute-response` | Action execution result           |
| `stream-event`            | Streaming chat response chunk     |
| `request`                 | API call (network, storage, etc.) |
| `event-emit`              | Emit event to other extensions    |

---

## Event Types (OrchestratorEvent)

Events emitted by ChatOrchestrator during message streaming. All events include `queueId` for request correlation.

| Event Type            | Payload                                         | When Emitted                     |
| --------------------- | ----------------------------------------------- | -------------------------------- |
| `conversation-created`| `{ conversation }`                              | New conversation started         |
| `interaction-started` | `{ interactionId, conversationId, role, text }` | Message processing begins        |
| `thinking-update`     | `{ text }`                                      | AI thinking content (streaming)  |
| `thinking-done`       | -                                               | AI thinking complete             |
| `content-update`      | `{ text }`                                      | AI response content (streaming)  |
| `tool-start`          | `{ name }`                                      | Tool execution begins            |
| `tool-complete`       | `{ tool: ToolCall }`                            | Tool execution finished          |
| `stream-complete`     | `{ messages }`                                  | All streaming finished           |
| `stream-error`        | `{ error }`                                     | Error during streaming           |
| `interaction-saved`   | `{ interaction }`                               | Interaction persisted to DB      |
| `queue-update`        | `{ queue: QueueState }`                         | Message queue state changed      |
| `state-change`        | -                                               | Orchestrator state changed       |

---

## Chat Events (Cross-Client Notifications)

Events broadcast to all connected clients via SSE (`GET /chat/events`) or IPC. Used for cross-tab synchronization and background notifications.

| Event Type             | Purpose                                |
| ---------------------- | -------------------------------------- |
| `interaction-saved`    | New interaction saved (refresh UI)     |
| `instruction-received` | Background instruction queued for user |
| `conversation-updated` | Conversation metadata changed          |

**Client-side filtering:**

```typescript
// In chatEventClient.ts
chatEventEmitter.on('chat-event', (event: ChatEvent) => {
  if (event.userId === currentUserId) {
    // Handle event for current user only
  }
})
```

---

## userId Propagation Summary

Complete flow of userId from authentication to extension execution:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        userId FLOW                                      │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [Web Client]                                                           │
│       │                                                                 │
│       │ JWT in Authorization header                                     │
│       ▼                                                                 │
│  [API: requireAuth middleware]                                          │
│       │                                                                 │
│       │ request.user.id = userId from JWT                               │
│       ▼                                                                 │
│  [SessionManager(userId)]                                               │
│       │                                                                 │
│       │ Creates user-scoped orchestrator                                │
│       ▼                                                                 │
│  [ChatOrchestrator({ userId, repository: userRepo })]                   │
│       │                                                                 │
│       │ Passes userId to tool executor                                  │
│       ▼                                                                 │
│  [ToolExecutionContext { userId, timezone }]                            │
│       │                                                                 │
│       │ Forwarded to extension host                                     │
│       ▼                                                                 │
│  [ExtensionHost.executeTool(extId, toolId, params, userId)]             │
│       │                                                                 │
│       │ Sent via Worker message                                         │
│       ▼                                                                 │
│  [Worker: tool-execute-request { toolId, params, userId }]              │
│       │                                                                 │
│       │ Creates ExecutionContext with user-scoped APIs                  │
│       ▼                                                                 │
│  [Extension Tool: execute(params, context)]                             │
│       │                                                                 │
│       │ context.userId and context.userStorage available                │
│       ▼                                                                 │
│  [userStorage.put('tasks', id, data)]  // Isolated per userId           │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Key Design Principles

### 1. Request-Scoped Context

No global mutable state. The userId flows explicitly through each layer via dependency injection and function parameters. This ensures:
- Thread safety in concurrent scenarios
- Clear data ownership and access patterns
- Testability through explicit dependencies

### 2. User-Scoped Repositories

`ConversationRepository` and other data repositories are instantiated per-user, ensuring complete data isolation:

```typescript
// Each user gets their own repository instance
const repository = new ConversationRepository(db, userId)
const orchestrator = new ChatOrchestrator({ userId, repository, ... })
```

### 3. Event Correlation

All orchestrator events include `queueId` to match responses with requests. This enables:
- Multiple concurrent streams per user
- Request cancellation
- Progress tracking per message

### 4. Consistent Interface

Web (SSE) and Electron (IPC) use identical event types and data structures:

```typescript
// Same event type regardless of transport
type OrchestratorEvent =
  | { type: 'content-update'; text: string; queueId: string }
  | { type: 'tool-start'; name: string; queueId: string }
  // ...
```

### 5. Extension Isolation

Extensions receive `ExecutionContext` with scoped APIs rather than raw database access:

- **Extension-scoped**: `storage`, `secrets` - shared data across all users of the extension
- **User-scoped**: `userStorage`, `userSecrets` - isolated per userId automatically

This provides security through isolation while giving extensions the flexibility they need for both shared and user-specific data.
