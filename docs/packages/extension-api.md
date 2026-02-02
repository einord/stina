# @stina/extension-api

Types and runtime for building Stina extensions.

## Overview

The `@stina/extension-api` package provides everything extensions need to integrate with Stina:

- **Type definitions** for manifests, permissions, providers, tools, and contexts
- **Runtime module** that handles communication between extensions and the host
- **Initialization function** to bootstrap extension lifecycle

Extensions import types from the main package and the runtime from the `/runtime` subpath.

## Installation

```bash
pnpm add @stina/extension-api
```

## Key Exports

### Manifest Types

```typescript
import type { ExtensionManifest, Platform } from '@stina/extension-api'
```

- **ExtensionManifest** - Schema for `manifest.json` files
- **Platform** - Supported platforms: `'web' | 'electron' | 'tui'`

### Permission Types

```typescript
import type {
  Permission,
  NetworkPermission,
  StoragePermission,
  UserDataPermission,
  CapabilityPermission,
  SystemPermission,
} from '@stina/extension-api'
```

Permissions control what APIs are available to the extension:

| Category | Examples |
|----------|----------|
| Network | `network:*`, `network:localhost`, `network:api.example.com` |
| Storage | `storage.collections`, `secrets.manage` |
| User Data | `user.profile.read`, `chat.history.read` |
| Capabilities | `provider.register`, `tools.register`, `actions.register` |
| System | `files.read`, `files.write`, `clipboard.read` |

### AI Provider Types

```typescript
import type { AIProvider, ModelInfo, ChatMessage, ChatOptions, StreamEvent } from '@stina/extension-api'
```

- **AIProvider** - Interface for implementing AI providers
- **ModelInfo** - Model metadata (id, name, contextLength)
- **ChatMessage** - Message format for chat completions
- **ChatOptions** - Options for chat requests (model, temperature, maxTokens)
- **StreamEvent** - Events emitted during streaming (content, thinking, tool_start, done, error)

### Tool Types

```typescript
import type { Tool, ToolResult, ToolConfirmationConfig } from '@stina/extension-api'
```

- **Tool** - Interface for implementing tools that Stina can use
- **ToolResult** - Result format from tool execution
- **ToolConfirmationConfig** - Configuration for requiring user confirmation before tool execution

#### Tool Confirmation

Tools can require user confirmation before executing. This is useful for sensitive operations like sending emails, deleting data, or making purchases.

```typescript
const tool: Tool = {
  id: 'my-tool',
  name: 'Send Email',
  description: 'Sends an email',
  confirmation: {
    prompt: {
      en: 'Allow sending this email?',
      sv: 'Tillåt att skicka detta e-postmeddelande?',
    },
  },
  async execute(params) {
    // Only runs after user confirms
    return { success: true }
  },
}
```

When `confirmation` is set, Stina will:
1. Pause tool execution and show a confirmation dialog
2. Display the prompt (or a default if not provided)
3. Wait for user to approve or deny
4. Execute the tool only if approved, otherwise return an error to the AI

### Context Types

```typescript
import type { ExtensionContext, ExecutionContext, Disposable } from '@stina/extension-api'
```

- **ExtensionContext** - Provided to `activate()`, contains permission-gated APIs
- **ExecutionContext** - Provided to tool/action `execute()`, contains request-scoped data
- **Disposable** - Resource cleanup interface with `dispose()` method

## Extension Runtime

The runtime module handles the extension lifecycle inside a worker:

```typescript
import { initializeExtension } from '@stina/extension-api/runtime'
```

### initializeExtension

Bootstraps the extension and sets up communication with the host:

```typescript
import { initializeExtension } from '@stina/extension-api/runtime'

initializeExtension({
  activate(context) {
    // Extension startup logic
    // Register providers, tools, actions
    return { dispose: () => { /* cleanup */ } }
  },
  deactivate() {
    // Optional cleanup
  }
})
```

The runtime:
1. Detects the environment (Node.js Worker Thread or Web Worker)
2. Sets up message handling with the Extension Host
3. Builds the `ExtensionContext` based on granted permissions
4. Calls the extension's `activate()` function
5. Routes requests for providers, tools, and actions

## Context Types

### ExtensionContext

Provided during activation. APIs are conditionally available based on permissions:

```typescript
interface ExtensionContext {
  extension: { id: string; version: string; storagePath: string }
  log: LogAPI                        // Always available
  network?: NetworkAPI               // Requires network:* permission
  settings?: SettingsAPI             // Requires settings.register
  providers?: ProvidersAPI           // Requires provider.register
  tools?: ToolsAPI                   // Requires tools.register
  actions?: ActionsAPI               // Requires actions.register
  events?: EventsAPI                 // Requires events.emit
  scheduler?: SchedulerAPI           // Requires scheduler.register
  user?: UserAPI                     // Requires user.profile.read
  chat?: ChatAPI                     // Requires chat.message.write
  storage?: StorageAPI               // Requires storage.collections
  secrets?: SecretsAPI               // Requires secrets.manage
  backgroundWorkers?: BackgroundWorkersAPI // Requires background.workers
}
```

### ExecutionContext

Provided to every tool and action execution. Contains request-scoped data:

```typescript
interface ExecutionContext {
  userId?: string                    // Current user (undefined during activation)
  extension: { id: string; version: string; storagePath: string }
  storage: StorageAPI                // Extension-wide storage
  userStorage: StorageAPI            // User-scoped storage
  secrets: SecretsAPI                // Extension-wide secrets
  userSecrets: SecretsAPI            // User-scoped secrets
}
```

This design eliminates race conditions by providing explicit context per request instead of relying on global state.

## Usage Example

```typescript
// src/index.ts
import { initializeExtension } from '@stina/extension-api/runtime'
import type { AIProvider, Tool, ExtensionContext } from '@stina/extension-api/runtime'

initializeExtension({
  activate(context: ExtensionContext) {
    // Register an AI provider
    const provider: AIProvider = {
      id: 'my-provider',
      name: 'My Provider',
      async getModels() { return [{ id: 'model-1', name: 'Model 1' }] },
      async *chat(messages, options) {
        yield { type: 'content', text: 'Hello!' }
        yield { type: 'done' }
      }
    }
    context.providers?.register(provider)

    // Register a tool
    const tool: Tool = {
      id: 'my-tool',
      name: 'My Tool',
      description: 'Does something useful',
      parameters: { type: 'object', properties: {} },
      async execute(params, execContext) {
        // Access user-scoped storage
        const data = await execContext.userStorage.get('cache', 'key')
        return { success: true, data }
      }
    }
    context.tools?.register(tool)

    return {
      dispose() {
        // Cleanup when extension is deactivated
      }
    }
  }
})
```

## Related Documentation

- [Extension System](../architecture/extensions.md) - How extensions work in Stina
- [Creating Extensions](../guides/creating-extensions.md) - Step-by-step guide
