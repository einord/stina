# Stina Architecture

This document provides a comprehensive overview of the Stina application architecture. Stina is an AI assistant chat application built as a TypeScript monorepo that supports multiple frontends (Web, Electron, CLI) sharing the same core business logic.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Layer Diagram](#layer-diagram)
- [Package Dependency Matrix](#package-dependency-matrix)
- [Critical Design Rules](#critical-design-rules)
- [ApiClient Pattern](#apiclient-pattern)
- [Streaming Pattern](#streaming-pattern)
- [Package Details](#package-details)
- [Application Structure](#application-structure)

---

## Architecture Overview

The codebase is split into two distinct layers:

1. **Node.js Layer** - API, TUI, Electron main process, and all packages except ui-vue
2. **Browser Layer** - Web app, Electron renderer, and packages/ui-vue

This separation ensures clean boundaries between platform-specific code and shared business logic.

---

## Layer Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Browser Layer                                   │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         packages/ui-vue                                │  │
│  │              (Shared Vue Components, Theme, ApiClient)                 │  │
│  └─────────────────────────┬───────────────────────┬─────────────────────┘  │
│                            │                       │                         │
│                            ▼                       ▼                         │
│                     ┌────────────┐          ┌─────────────┐                  │
│                     │  apps/web  │          │  Electron   │                  │
│                     │   (Vue)    │          │  Renderer   │                  │
│                     └──────┬─────┘          └──────┬──────┘                  │
│                            │                       │                         │
└────────────────────────────┼───────────────────────┼─────────────────────────┘
                             │ HTTP                  │ IPC
                             ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Node.js Layer                                   │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌───────────────────────────────────┐    │
│  │  apps/api   │  │  apps/tui   │  │      apps/electron (main)         │    │
│  │  (Fastify)  │  │   (CLI)     │  │          (Node.js)                │    │
│  └──────┬──────┘  └──────┬──────┘  └────────────────┬──────────────────┘    │
│         │                │                          │                        │
│         ▼                ▼                          ▼                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │    packages/chat, packages/extension-host, packages/adapters-node    │   │
│  │              (Node.js APIs: DB, filesystem, workers)                 │   │
│  └──────────────────────────────────┬───────────────────────────────────┘   │
│                                     │                                        │
│                                     ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                          packages/core                                │   │
│  │             (Pure TypeScript: business logic, interfaces)             │   │
│  └──────────────────────────────────┬───────────────────────────────────┘   │
│                                     │                                        │
│                                     ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         packages/shared                               │   │
│  │                          (Types, DTOs)                                │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Package Dependency Matrix

The following matrix shows which packages can depend on which. An "X" indicates a valid dependency.

| Package              | shared | core | adapters-node | chat | extension-host | extension-api | ui-vue | auth | builtin-tools | i18n | scheduler |
|----------------------|:------:|:----:|:-------------:|:----:|:--------------:|:-------------:|:------:|:----:|:-------------:|:----:|:---------:|
| **shared**           |   -    |      |               |      |                |               |        |      |               |      |           |
| **core**             |   X    |  -   |               |      |                |               |        |      |               |      |           |
| **adapters-node**    |   X    |  X   |       -       |      |                |               |        |      |               |      |           |
| **chat**             |   X    |  X   |       X       |  -   |                |               |        |      |               |   X  |           |
| **extension-host**   |   X    |  X   |               |  X   |        -       |       X       |        |      |               |      |           |
| **extension-api**    |   X    |      |               |      |                |       -       |        |      |               |      |           |
| **ui-vue**           |   X    |  X   |               |      |                |               |    -   |      |               |   X  |           |
| **auth**             |   X    |  X   |       X       |      |                |               |        |  -   |               |      |           |
| **builtin-tools**    |   X    |  X   |               |  X   |                |               |        |      |       -       |   X  |           |
| **scheduler**        |   X    |  X   |               |      |                |               |        |      |               |      |     -     |
| **apps/api**         |   X    |  X   |       X       |  X   |        X       |               |        |  X   |       X       |   X  |     X     |
| **apps/web**         |   X    |      |               |      |                |               |    X   |      |               |   X  |           |
| **apps/electron**    |   X    |  X   |       X       |  X   |        X       |               |    X   |  X   |       X       |   X  |     X     |
| **apps/tui**         |   X    |  X   |       X       |  X   |        X       |               |        |      |       X       |   X  |     X     |

**Key observations:**
- `shared` has no dependencies (pure types)
- `core` only depends on `shared` (pure TypeScript)
- `ui-vue` cannot depend on Node.js packages (`adapters-node`, `chat`, `extension-host`)
- Apps can depend on everything they need for their platform

---

## Critical Design Rules

These rules are fundamental to the architecture and must be strictly followed:

### 1. `packages/core` is Pure TypeScript

**Rule:** NO imports from Node.js, browser APIs, or frameworks.

```typescript
// CORRECT - packages/core
import type { ThemeTokens } from '@stina/shared'

export function validateTheme(tokens: ThemeTokens): boolean {
  return !!tokens.background && !!tokens.foreground
}
```

```typescript
// WRONG - packages/core
import { readFileSync } from 'fs'  // Node.js API
import { ref } from 'vue'          // Framework
```

**Rationale:** Core must run in any JavaScript environment - Node.js, browsers, or workers.

### 2. `packages/chat` Runs in Node.js

**Rule:** Can use Node.js APIs (path, url, etc.) but NOT Vue or browser-specific APIs.

```typescript
// CORRECT - packages/chat
import { URL } from 'url'

export class ChatOrchestrator {
  // All chat business logic belongs here
}
```

```typescript
// WRONG - packages/chat
import { ref, computed } from 'vue'  // Browser/Vue API
import { useApi } from '@stina/ui-vue' // UI package
```

**Rationale:** Chat orchestration needs filesystem, database, and worker APIs that only exist in Node.js.

### 3. `packages/ui-vue` is Browser-Only

**Rule:** Vue components for Web and Electron renderer. Receives data via props/composables. Never put business logic here.

```typescript
// CORRECT - packages/ui-vue
<script setup lang="ts">
import { useApi } from '../composables/useApi.js'

const props = defineProps<{ message: string }>()
const api = useApi()
</script>
```

```typescript
// WRONG - packages/ui-vue
import { getDb } from '@stina/adapters-node'  // Node.js package
import { ChatOrchestrator } from '@stina/chat' // Node.js package
```

**Rationale:** UI components must work in any browser context (web or Electron renderer).

### 4. Apps are Thin Wrappers

**Rule:** Apps wire dependencies and call core/chat. Minimal business logic.

```typescript
// CORRECT - apps/api
import { ChatOrchestrator } from '@stina/chat'
import { ConversationRepository } from '@stina/adapters-node'

// Wire dependencies, then delegate
const repository = new ConversationRepository(db, userId)
const orchestrator = new ChatOrchestrator({ repository, ... })
```

```typescript
// WRONG - apps/api
// Implementing chat logic directly in the route handler
fastify.post('/chat', async (request) => {
  // 100 lines of chat processing logic that should be in packages/chat
})
```

**Rationale:** Keeps apps lightweight and ensures business logic is shared across all frontends.

### 5. Extension Isolation

**Rule:** Extensions run in sandboxed Worker Threads. They cannot directly access the database, filesystem, or main thread globals.

```
Main Process                    Worker Thread (Sandboxed)
┌────────────────┐              ┌────────────────┐
│ ExtensionHost  │◄────IPC─────►│   Extension    │
│                │              │                │
│ - Validates    │              │ - Limited API  │
│ - Permissions  │              │ - No DB access │
│ - Routes msgs  │              │ - No fs access │
└────────────────┘              └────────────────┘
```

**Rationale:** Security and stability. Malicious or buggy extensions cannot crash the main process or access unauthorized data.

---

## ApiClient Pattern

The ApiClient abstraction allows browser code to communicate with the backend without knowing the transport mechanism.

### Interface Definition

```typescript
// packages/ui-vue/src/composables/useApi.ts
interface ApiClient {
  getGreeting(name?: string): Promise<Greeting>
  getThemes(): Promise<ThemeSummary[]>
  getThemeTokens(id: string): Promise<ThemeTokens>
  getExtensions(): Promise<ExtensionSummary[]>
  getConversations(): Promise<ConversationDTO[]>
  streamChat(conversationId: string, message: string): AsyncIterable<ChatEvent>
  health(): Promise<{ ok: boolean }>
  // ... additional methods
}
```

### Web Implementation (HTTP)

```typescript
// apps/web/src/api/client.ts
export function createHttpApiClient(): ApiClient {
  const baseUrl = '/api'

  return {
    async getGreeting(name?: string) {
      const params = name ? `?name=${encodeURIComponent(name)}` : ''
      const response = await fetch(`${baseUrl}/hello${params}`)
      return response.json()
    },

    async getThemes() {
      const response = await fetch(`${baseUrl}/themes`)
      return response.json()
    },

    // HTTP requests for all operations
  }
}
```

### Electron Implementation (IPC)

```typescript
// apps/electron/src/renderer/api/client.ts
export function createIpcApiClient(): ApiClient {
  return {
    async getGreeting(name?: string) {
      return window.electronAPI.invoke('get-greeting', name)
    },

    async getThemes() {
      return window.electronAPI.invoke('get-themes')
    },

    // IPC calls for all operations (no HTTP overhead)
  }
}
```

### IPC Handler (Electron Main)

```typescript
// apps/electron/src/main/ipc.ts
import { ipcMain } from 'electron'
import { getGreeting } from '@stina/core'
import { themeRegistry } from '@stina/core'

ipcMain.handle('get-greeting', async (_event, name?: string) => {
  return getGreeting(name)
})

ipcMain.handle('get-themes', async () => {
  return themeRegistry.getAllSummaries()
})
```

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Web App                                     │
│                                                                          │
│   Vue Component                    HTTP ApiClient                        │
│   ┌──────────────┐                ┌──────────────┐                      │
│   │ const api =  │───useApi()────►│   fetch()    │                      │
│   │ useApi()     │                │   /api/...   │                      │
│   │              │                └──────┬───────┘                      │
│   └──────────────┘                       │                              │
│                                          │ HTTP                         │
└──────────────────────────────────────────┼──────────────────────────────┘
                                           ▼
                                    ┌──────────────┐
                                    │  Fastify API │
                                    │   Server     │
                                    └──────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                            Electron App                                  │
│                                                                          │
│   Vue Component                    IPC ApiClient        Electron Main    │
│   ┌──────────────┐                ┌──────────────┐     ┌──────────────┐ │
│   │ const api =  │───useApi()────►│   window.    │─IPC►│  ipcMain.    │ │
│   │ useApi()     │                │ electronAPI. │     │  handle()    │ │
│   │              │                │  invoke()    │     │              │ │
│   └──────────────┘                └──────────────┘     └──────────────┘ │
│                                                               │          │
│                                                               ▼          │
│                                                        ┌──────────────┐ │
│                                                        │ @stina/core  │ │
│                                                        │ @stina/chat  │ │
│                                                        └──────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### Benefits

1. **Same Vue components** work in both Web and Electron
2. **No code changes** needed when switching platforms
3. **Electron is faster** - no HTTP serialization overhead
4. **Web is stateless** - easy horizontal scaling

---

## Streaming Pattern

Chat responses are streamed to provide real-time feedback. The streaming approach differs between platforms.

### Web: Server-Sent Events (SSE)

The web app uses SSE through the API server:

```typescript
// apps/api/src/routes/chatStream.ts
fastify.post('/chat/stream', { preHandler: requireAuth }, async (request, reply) => {
  const { conversationId, message } = request.body
  const userId = request.user!.id

  // Set up SSE headers
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })

  // Get session manager for user
  const sessionManager = await getSessionManager(userId)
  const session = sessionManager.getSession({ conversationId })
  const orchestrator = session.orchestrator

  // Stream events to client
  orchestrator.onEvent((event) => {
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
  })

  await orchestrator.enqueueMessage(message, 'user', queueId)
})
```

```typescript
// apps/web/src/api/client.ts
async *streamChat(conversationId: string, message: string): AsyncIterable<ChatEvent> {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, message }),
  })

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const text = decoder.decode(value)
    const events = parseSSE(text)
    for (const event of events) {
      yield event
    }
  }
}
```

### Electron/TUI: Direct ChatOrchestrator

Electron main process and TUI use ChatOrchestrator directly:

```typescript
// apps/electron/src/main/ipc.ts
ipcMain.handle('chat-stream', async (event, conversationId, message) => {
  const sessionManager = getOrCreateSessionManager()
  const session = sessionManager.getSession({ conversationId })
  const orchestrator = session.orchestrator

  // Forward events directly to renderer via IPC
  orchestrator.onEvent((chatEvent) => {
    event.sender.send('chat-event', chatEvent)
  })

  await orchestrator.enqueueMessage(message, 'user', queueId)
})
```

```typescript
// apps/tui/src/commands/chat.ts
const orchestrator = new ChatOrchestrator({
  repository,
  providerRegistry,
  toolRegistry,
  // ...
})

orchestrator.onEvent((event) => {
  if (event.type === 'token') {
    process.stdout.write(event.content)
  }
})

await orchestrator.enqueueMessage(userInput, 'user', queueId)
```

### Streaming Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                           packages/chat                                 │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                       ChatOrchestrator                             │ │
│  │                                                                     │ │
│  │  - Platform-neutral business logic                                 │ │
│  │  - Callback-based event system (no EventEmitter)                   │ │
│  │  - Dependency injection for repository/providers                   │ │
│  │                                                                     │ │
│  │  Events: token, thinking, tool_call, tool_result, complete, error  │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
           ┌────────────────────────┼────────────────────────┐
           │                        │                        │
           ▼                        ▼                        ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│   Web (via API)     │  │       TUI           │  │   Electron Main     │
│                     │  │                     │  │                     │
│  ChatOrchestrator   │  │  ChatOrchestrator   │  │  ChatOrchestrator   │
│        │            │  │        │            │  │        │            │
│        ▼            │  │        ▼            │  │        ▼            │
│  SSE Response       │  │  stdout.write()     │  │  IPC send()         │
│        │            │  │                     │  │        │            │
│        ▼            │  │                     │  │        ▼            │
│  Browser EventSource│  │                     │  │  Renderer receive() │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
```

### Event Types

```typescript
type OrchestratorEvent =
  | { type: 'token'; content: string }           // Streaming text token
  | { type: 'thinking'; content: string }        // Model reasoning
  | { type: 'tool_call'; tool: string; args: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; result: ToolResult }
  | { type: 'complete'; interaction: InteractionDTO }
  | { type: 'error'; error: string }
  | { type: 'state_change'; state: ChatState }
```

---

## Package Details

### packages/shared

Pure TypeScript types and DTOs. No runtime code, no dependencies.

**Key exports:**
- `Greeting`, `ThemeSummary`, `ExtensionSummary` - DTOs
- `ConversationDTO`, `InteractionDTO`, `MessageDTO` - Chat DTOs
- Type definitions shared across all packages

### packages/core

Platform-neutral business logic. Defines interfaces, implements registries.

**Key exports:**
- `ExtensionRegistry`, `ThemeRegistry` - Registration systems
- `AppError`, `ErrorCode` - Error handling
- `Logger`, `SettingsStore` - Interface definitions (not implementations)

### packages/adapters-node

Node.js-specific implementations. Database, file I/O, encryption.

**Key exports:**
- `getDb()`, `runMigrations()` - Database (SQLite via Drizzle)
- `loadExtensions()`, `builtinExtensions` - Extension loading
- `EncryptedSettingsStore` - Secure settings storage
- `createConsoleLogger()` - Logging implementation

### packages/chat

Platform-neutral chat orchestration. Core chat business logic.

**Key exports:**
- `ChatOrchestrator` - Main chat coordination
- `ChatStreamService` - Streaming management
- `providerRegistry` - AI provider management
- `toolRegistry` - Tool registration and execution

### packages/ui-vue

Shared Vue components and platform abstractions.

**Key exports:**
- Vue components: `GreetingCard`, `ChatMessage`, etc.
- `useApi()`, `useApp()` - Composables
- `applyTheme()` - Theme application
- `ApiClient` interface definition

---

## Application Structure

### apps/api (Fastify)

REST API server providing HTTP endpoints for the web frontend.

- **Port:** 3001 (default)
- **Framework:** Fastify
- **Key responsibilities:** Route handling, SSE streaming, authentication

### apps/web (Vue + Vite)

Web frontend using HTTP-based ApiClient.

- **Port:** 3002 (dev)
- **Framework:** Vue 3 + Vite
- **Key responsibilities:** UI rendering, SSE consumption

### apps/electron

Desktop application with main process and renderer.

```
apps/electron/
├── src/
│   ├── main/           # Electron main process (Node.js)
│   │   ├── index.ts    # Window creation, app lifecycle
│   │   └── ipc.ts      # IPC handlers → calls core directly
│   ├── preload/        # Context bridge
│   │   └── index.ts    # Exposes safe IPC methods to renderer
│   └── renderer/       # Vue app (Chromium)
│       ├── main.ts     # Vue app entry
│       └── api/
│           └── client.ts  # IPC-based ApiClient
```

**Key insight:** Electron main process imports core + adapters-node directly. No HTTP needed.

### apps/tui (Commander CLI)

Command-line interface for terminal usage.

- **Framework:** Commander.js
- **Key responsibilities:** CLI commands, direct orchestrator usage

---

## Summary

The Stina architecture achieves:

1. **Code reuse** - Core business logic shared across all platforms
2. **Clean separation** - Browser and Node.js layers are clearly delineated
3. **Flexibility** - Easy to add new frontends (mobile, etc.)
4. **Security** - Extensions sandboxed in workers with permission system
5. **Performance** - Electron uses IPC (no HTTP), web scales horizontally

When developing:
- Put business logic in `packages/core` or `packages/chat`
- Keep `packages/ui-vue` purely presentational
- Follow the ApiClient pattern for new frontend features
- Use the streaming pattern for real-time updates
