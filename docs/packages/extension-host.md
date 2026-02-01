# Extension Host Package

The `@stina/extension-host` package manages extension lifecycle, message routing, and permission enforcement. It provides sandboxed execution of extensions using Worker threads (Node.js) or Web Workers (browser).

## Extension Host Pattern

The Extension Host follows a host-worker architecture where:

1. **Host Process**: The main application (API server, Electron, web app) runs the ExtensionHost
2. **Worker Threads**: Each extension runs in an isolated worker with restricted capabilities
3. **Message Passing**: All communication happens via structured messages through a defined protocol

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Main Application                                 │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                      ExtensionHost                                 │  │
│  │  - PermissionChecker (validates each request)                      │  │
│  │  - ManifestValidator (validates manifest.json)                     │  │
│  │  - HandlerRegistry (routes requests to handlers)                   │  │
│  └─────────────────────────────┬─────────────────────────────────────┘  │
│                                │                                         │
│                    Message Protocol (postMessage)                        │
│                                │                                         │
│  ┌─────────────────────────────┼─────────────────────────────────────┐  │
│  │                             ▼                                      │  │
│  │   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐          │  │
│  │   │   Worker 1   │   │   Worker 2   │   │   Worker 3   │          │  │
│  │   │  Extension A │   │  Extension B │   │  Extension C │          │  │
│  │   │  (isolated)  │   │  (isolated)  │   │  (isolated)  │          │  │
│  │   └──────────────┘   └──────────────┘   └──────────────┘          │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Platform Implementations

### NodeExtensionHost

Used in: API server, Electron main process, TUI.

```typescript
import { NodeExtensionHost } from '@stina/extension-host'

const host = new NodeExtensionHost({
  storagePath: '/path/to/storage',
  logger: console,
  storageCallbacks: { /* storage handlers */ },
  secretsCallbacks: { /* secrets handlers */ },
})

// Load extension from directory
await host.loadExtensionFromPath('/path/to/extension')
```

Features specific to Node.js:
- Uses `worker_threads` for isolation
- Supports `storage.collections` permission with SQLite backend
- Supports `secrets.manage` permission with encrypted storage
- Background task management with restart policies

### WebExtensionHost

Used in: Web app, Electron renderer process.

```typescript
import { WebExtensionHost } from '@stina/extension-host'

const host = new WebExtensionHost({
  extensionsBaseUrl: '/extensions',
})

// Load by ID (fetches manifest from base URL)
await host.loadExtensionById('my-extension')

// Or load with explicit manifest and URL
await host.loadExtensionFromUrl(manifest, 'https://cdn.example.com/ext/index.js')
```

Features specific to browser:
- Uses Web Workers for isolation
- Storage uses `localStorage` with extension-prefixed keys
- Limited permission support (no secrets, no background workers)

## Core Components

### PermissionChecker

Validates that extension requests are allowed based on declared permissions.

```typescript
import { PermissionChecker } from '@stina/extension-host'

const checker = new PermissionChecker({
  permissions: ['network:localhost:11434', 'storage.collections'],
  storageContributions: manifest.contributes?.storage,
})

// Check network access
const result = checker.checkNetworkAccess('http://localhost:11434/api/chat')
if (!result.allowed) {
  throw new Error(result.reason)
}

// Check storage access
const storageCheck = checker.checkStorageCollectionsAccess()

// Validate collection is declared in manifest
const collectionCheck = checker.validateCollectionAccess(extensionId, 'messages')
```

### ManifestValidator

Validates extension manifest.json files using Zod schemas.

```typescript
import { validateManifest, parseManifest } from '@stina/extension-host'

// Validate an object
const result = validateManifest(manifestObject)
if (!result.valid) {
  console.error('Errors:', result.errors)
}
console.log('Warnings:', result.warnings)

// Parse and validate JSON string
const { manifest, result } = parseManifest(jsonString)
```

### ExtensionProviderBridge

Automatically bridges extension providers to the chat system's ProviderRegistry.

```typescript
import { ExtensionProviderBridge } from '@stina/extension-host'

const bridge = new ExtensionProviderBridge(
  extensionHost,
  (provider) => providerRegistry.register(provider),
  (providerId) => providerRegistry.unregister(providerId)
)

// Providers are automatically registered/unregistered as extensions load
```

## Permission System

Extensions must declare required permissions in `manifest.json`. The host enforces these at runtime.

### Network Permissions

| Permission | Access |
|------------|--------|
| `network:localhost:11434` | Localhost on specific port |
| `network:localhost` | Localhost on any port |
| `network:api.example.com` | Specific domain |
| `network:*` | Any network access (use sparingly) |

### Registration Permissions

| Permission | Capability |
|------------|------------|
| `provider.register` | Register AI providers |
| `tools.register` | Register tools for AI use |
| `actions.register` | Register UI actions |
| `settings.register` | Register configurable settings |

### Storage Permissions

| Permission | Capability |
|------------|------------|
| `storage.collections` | Document storage (SQLite-backed) |
| `secrets.manage` | Encrypted secrets storage |

### System Permissions

| Permission | Capability |
|------------|------------|
| `scheduler.register` | Schedule recurring jobs |
| `events.emit` | Emit custom events |
| `user.profile.read` | Read current user profile |
| `chat.message.write` | Write messages to chat |
| `background.workers` | Run background tasks |

### Permission Example

```json
{
  "permissions": [
    "network:localhost:11434",
    "provider.register",
    "tools.register",
    "storage.collections",
    "secrets.manage"
  ]
}
```

## Extension Storage System

The storage system provides SQLite-backed document storage with collection isolation.

### StorageAPI Interface

```typescript
interface StorageAPI {
  // Document operations
  put<T extends object>(collection: string, id: string, data: T): Promise<void>
  get<T>(collection: string, id: string): Promise<T | undefined>
  delete(collection: string, id: string): Promise<boolean>

  // Query operations
  find<T>(collection: string, query?: Query, options?: QueryOptions): Promise<T[]>
  findOne<T>(collection: string, query: Query): Promise<T | undefined>
  count(collection: string, query?: Query): Promise<number>

  // Bulk operations
  putMany<T extends object>(collection: string, docs: Array<{ id: string; data: T }>): Promise<void>
  deleteMany(collection: string, query: Query): Promise<number>

  // Collection management
  dropCollection(collection: string): Promise<void>
  listCollections(): Promise<string[]>
}
```

### Query Interface

MongoDB-style queries for filtering documents:

```typescript
interface Query {
  [field: string]: unknown | {
    $gt?: unknown      // Greater than
    $gte?: unknown     // Greater than or equal
    $lt?: unknown      // Less than
    $lte?: unknown     // Less than or equal
    $ne?: unknown      // Not equal
    $in?: unknown[]    // In array
    $contains?: string // Case-insensitive substring match
  }
}

interface QueryOptions {
  sort?: Record<string, 'asc' | 'desc'>
  limit?: number
  offset?: number
}
```

### Query Examples

```typescript
// Exact match
const users = await storage.find('users', { status: 'active' })

// Comparison operators
const recent = await storage.find('messages', {
  timestamp: { $gte: '2024-01-01' }
})

// Multiple conditions
const results = await storage.find('products', {
  category: 'electronics',
  price: { $lte: 1000 }
}, {
  sort: { price: 'asc' },
  limit: 10
})

// Text search
const matches = await storage.find('documents', {
  content: { $contains: 'search term' }
})
```

### SecretsAPI Interface

Encrypted storage for sensitive data like API keys:

```typescript
interface SecretsAPI {
  set(key: string, value: string): Promise<void>
  get(key: string): Promise<string | undefined>
  delete(key: string): Promise<boolean>
  list(): Promise<string[]>
}
```

Secret keys must match pattern: `/^[a-zA-Z0-9_.-]+$/`

## Manifest Storage Declaration

Collections must be declared in the manifest to be accessible:

```json
{
  "contributes": {
    "storage": {
      "collections": {
        "conversations": {
          "indexes": ["userId", "createdAt"]
        },
        "messages": {
          "indexes": ["conversationId", "timestamp"]
        },
        "settings": {}
      }
    }
  }
}
```

### Index Configuration

Declare indexed fields for better query performance:

```json
{
  "collections": {
    "documents": {
      "indexes": ["userId", "category", "metadata.tags"]
    }
  }
}
```

Nested paths use dot notation (e.g., `metadata.tags`).

## Storage Isolation

### Extension-Scoped Storage

Default storage is scoped to the extension. Each extension has its own database file.

```typescript
// Extension A's "users" collection is separate from Extension B's
await storage.put('users', 'user-1', { name: 'Alice' })
```

### User-Scoped Storage

For multi-user applications, use the `ForUser` variants:

```typescript
// Store data specific to a user
await storage.putForUser(userId, 'preferences', 'theme', { dark: true })

// Retrieve user-specific data
const prefs = await storage.getForUser(userId, 'preferences', 'theme')

// Query user's documents
const userDocs = await storage.findForUser(userId, 'documents', {
  status: 'draft'
})
```

User-scoped storage creates separate database files per user:
- Extension storage: `{storagePath}/{extensionId}/storage.sqlite`
- User storage: `{storagePath}/{extensionId}/users/{userId}/storage.sqlite`

## Worker Thread Isolation

Each extension runs in a separate worker with restricted access:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Worker Thread                                  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Extension Code (bundled with @stina/extension-api runtime)       │  │
│  │                                                                    │  │
│  │  - No direct filesystem access                                     │  │
│  │  - No direct network access (proxied through host)                 │  │
│  │  - No access to other extensions                                   │  │
│  │  - Limited globals (no process, require, etc.)                     │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  Message Types:                                                          │
│  ← ready, request, provider-registered, tool-registered, stream-event   │
│  → activate, response, provider-chat-request, tool-execute-request      │
└─────────────────────────────────────────────────────────────────────────┘
```

### Security Boundaries

1. **Network**: All fetch requests are proxied through the host and validated against permissions
2. **Storage**: Extensions can only access collections declared in their manifest
3. **Secrets**: Encrypted with AES-256-GCM, scoped to extension (and optionally user)
4. **Events**: Extensions can only emit events, not subscribe to other extensions' events
5. **Resources**: Each worker is isolated; crashes don't affect other extensions

## API Reference

### ExtensionHost (Abstract Base)

```typescript
abstract class ExtensionHost extends EventEmitter<ExtensionHostEvents> {
  // Lifecycle
  loadExtension(manifest: ExtensionManifest, path: string): Promise<ExtensionInfo>
  unloadExtension(extensionId: string): Promise<void>

  // Queries
  getExtensions(): ExtensionInfo[]
  getExtension(extensionId: string): LoadedExtension | undefined
  getProviders(): ProviderInfo[]
  getProvider(providerId: string): ProviderInfo | undefined
  getTools(): ToolInfo[]
  getActions(): ActionInfo[]

  // Execution
  chat(providerId: string, messages: ChatMessage[], options: ChatOptions): AsyncGenerator<StreamEvent>
  getModels(providerId: string, options?: GetModelsOptions): Promise<ModelInfo[]>
  executeTool(extensionId: string, toolId: string, params: Record<string, unknown>): Promise<ToolResult>
  executeAction(extensionId: string, actionId: string, params: Record<string, unknown>): Promise<ActionResult>

  // Settings
  updateSettings(extensionId: string, key: string, value: unknown): Promise<void>
}
```

### Events

```typescript
interface ExtensionHostEvents {
  'extension-loaded': (extension: ExtensionInfo) => void
  'extension-error': (extensionId: string, error: Error) => void
  'extension-unloaded': (extensionId: string) => void
  'provider-registered': (provider: ProviderInfo) => void
  'provider-unregistered': (providerId: string) => void
  'tool-registered': (tool: ToolInfo) => void
  'tool-unregistered': (toolId: string) => void
  'action-registered': (action: ActionInfo) => void
  'action-unregistered': (actionId: string) => void
  'extension-event': (event: { extensionId: string; name: string; payload?: Record<string, unknown> }) => void
  'background-task-started': (extensionId: string, taskId: string) => void
  'background-task-stopped': (extensionId: string, taskId: string) => void
  'background-task-failed': (extensionId: string, taskId: string, error: string) => void
}
```

### Exports

```typescript
// Host implementations
export { ExtensionHost, NodeExtensionHost, WebExtensionHost }

// Provider/Tool bridges
export { createExtensionProviderAdapter, ExtensionProviderBridge, ExtensionToolBridge }

// Validation
export { PermissionChecker, validateManifest, parseManifest }

// Storage
export { SecretsManager, createSecretsManager, deriveEncryptionKey }
```
