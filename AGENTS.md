# AI Agent Instructions

This document provides context for AI agents working on the Stina codebase.

## Project Overview

**Stina** is an AI assistant chat application built as a TypeScript monorepo. The architecture supports multiple frontends (Web, Electron, CLI) sharing the same core business logic.

- **Version**: 0.20.0
- **Package Manager**: pnpm with workspaces
- **Node.js**: >=20 required

## Architecture

The codebase is split into two distinct layers:

1. **Node.js layer** - API, TUI, Electron main process, and all packages except ui-vue
2. **Browser layer** - Web app, Electron renderer, and packages/ui-vue

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Browser Layer                             │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    packages/ui-vue                            │  │
│  │           (Shared Vue Components, Theme, ApiClient)           │  │
│  └───────────────────────┬───────────────────┬───────────────────┘  │
│                          │                   │                      │
│                          ▼                   ▼                      │
│                   ┌────────────┐      ┌─────────────┐               │
│                   │  apps/web  │      │  Electron   │               │
│                   │   (Vue)    │      │  Renderer   │               │
│                   └──────┬─────┘      └──────┬──────┘               │
└──────────────────────────┼───────────────────┼──────────────────────┘
                           │ HTTP              │ IPC
                           ▼                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                           Node.js Layer                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐   │
│  │  apps/api   │  │  apps/tui   │  │     apps/electron (main)    │   │
│  │  (Fastify)  │  │   (CLI)     │  │       (Node.js)             │   │
│  └──────┬──────┘  └──────┬──────┘  └──────────────┬──────────────┘   │
│         │                │                        │                   │
│         ▼                ▼                        ▼                   │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  packages/chat, packages/extension-host, packages/adapters-node│  │
│  │            (Node.js APIs: DB, filesystem, workers)             │  │
│  └────────────────────────────────┬───────────────────────────────┘  │
│                                   │                                   │
│                                   ▼                                   │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                      packages/core                              │  │
│  │         (Pure TypeScript: business logic, interfaces)          │  │
│  └────────────────────────────────┬───────────────────────────────┘  │
│                                   │                                   │
│                                   ▼                                   │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                     packages/shared                             │  │
│  │                      (Types, DTOs)                              │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Critical Design Rules

1. **`packages/core` is pure TypeScript** - NO imports from Node.js, browser APIs, or frameworks. Only pure TypeScript that can run anywhere.
2. **`packages/chat` runs in Node.js** - Can use Node.js APIs (path, url, etc.) but NOT Vue or browser-specific APIs. All chat business logic belongs here.
3. **`packages/ui-vue` is browser-only** - Vue components for Web and Electron renderer. Receives data via props/composables. Never put business logic here.
4. **Apps are thin wrappers** - They wire dependencies and call core/chat, minimal business logic.
5. **ApiClient pattern** - Web uses HTTP, Electron uses IPC, but both implement the same interface.
6. **Streaming pattern** - Web uses SSE via API, Electron/TUI use ChatOrchestrator directly.

## i18n usage

- `@stina/i18n` auto-detects language on init. Vue apps must call `provideI18n(app)` once in `main.ts` (already done in web/electron).
- `installUi(app)` registers global helpers `$t`, `$setLang`, `$getLang` so components can translate without importing composables; prefer `$t('chat.input_placeholder')` etc. in templates.
- If you need translations in script setup, you can still use `useI18n()` from `@stina/ui-vue`, but default to `$t` in templates to avoid boilerplate.

## Package Structure

### packages/shared

Pure TypeScript types and DTOs. No runtime code, no dependencies.

```typescript
// Key exports
export interface Greeting {
  message: string
  timestamp: string
}
export interface ThemeSummary {
  id: string
  label: string
}
export interface ExtensionSummary {
  id: string
  name: string
  version: string
  type: 'feature' | 'theme'
}
```

### packages/core

Platform-neutral business logic. Defines interfaces, implements registries.

```typescript
// Key exports
export { getGreeting } from './hello/getGreeting.js'
export { ExtensionRegistry } from './extensions/registry.js'
export { themeRegistry, ThemeRegistry } from './themes/themeRegistry.js'
export { AppError, ErrorCode } from './errors/AppError.js'
export type { Logger, SettingsStore, ThemeTokens } from './...'
```

**Important**: Core defines interfaces (Logger, SettingsStore) but does NOT implement them. Implementations are in adapters-node.

### packages/adapters-node

Node.js-specific implementations. Database, file I/O, encryption.

```typescript
// Key exports
export { getDb, closeDb } from './db/connection.js'
export { runMigrations } from './db/migrate.js'
export { loadExtensions } from './extensions/loader.js'
export { builtinExtensions } from './extensions/builtins.js'
export { createConsoleLogger } from './logging/consoleLogger.js'
export { EncryptedSettingsStore } from './settings/encryptedSettingsStore.js'
export { getAppDataDir, getDbPath } from './paths.js'
```

### packages/chat

Platform-neutral chat orchestration. NO Vue, NO browser-specific APIs.

```typescript
// Key exports
export { ChatOrchestrator } from './orchestrator/ChatOrchestrator.js'
export { ChatStreamService } from './services/ChatStreamService.js'
export { conversationService } from './services/ConversationService.js'
export { providerRegistry, echoProvider } from './providers/index.js'
export { interactionToDTO, conversationToDTO } from './mappers/index.js'
export type { IConversationRepository, OrchestratorEvent, ChatState } from './orchestrator/index.js'
```

**Important**: All chat business logic belongs here, NOT in ui-vue or apps.

**ChatOrchestrator Pattern**:

- **Electron/TUI**: Instantiate directly with `ConversationRepository`
- **API**: Instantiate per-request, expose via SSE endpoint (`POST /chat/stream`)
- **Vue**: Thin SSE client in `ChatView.service.ts` - only handles reactivity

```
┌─────────────────────────────────────────────────────────────┐
│  packages/chat (ChatOrchestrator)                            │
│  - Platform-neutral business logic                           │
│  - Callback-based event system (no EventEmitter)             │
│  - Dependency injection for repository/providers             │
└─────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────┐
│  Web (SSE)      │ │  TUI            │ │  Electron Main      │
│  Via API        │ │  Direct usage   │ │  IPC handlers       │
└─────────────────┘ └─────────────────┘ └─────────────────────┘
```

### packages/extension-api

Types and runtime for building Stina extensions. Extensions import from this package.

```typescript
// Key exports
export type { ExtensionManifest, Permission, AIProvider, Tool } from './types.js'
export type { ExtensionContext, Disposable } from './types.js'
export { initializeExtension } from './runtime.js' // Worker-side runtime
```

**Important**: This package is used by extensions, not by Stina itself. Extensions run in isolated Workers.

### packages/extension-host

Extension lifecycle management and permission enforcement. Platform-specific implementations.

```typescript
// Key exports
export { ExtensionHost } from './ExtensionHost.js' // Abstract base class
export { NodeExtensionHost } from './NodeExtensionHost.js' // Node.js (Worker Threads)
export { PermissionChecker } from './PermissionChecker.js'
export { validateManifest } from './ManifestValidator.js'
export {
  ExtensionProviderBridge,
  createExtensionProviderAdapter,
} from './ExtensionProviderAdapter.js'
```

**Extension Host Pattern**:

- **API/TUI/Electron Main**: Use `NodeExtensionHost` with Worker Threads
- **Web/Electron Renderer**: Use `BrowserExtensionHost` with Web Workers (TODO)

```
┌─────────────────────────────────────────────────────────────┐
│  Extension Host                                              │
│  - Loads/validates manifests                                 │
│  - Spawns sandboxed workers                                  │
│  - Enforces permissions at runtime                           │
│  - Routes messages between app and extensions                │
└─────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────┐
│  Worker Thread  │ │  Worker Thread  │ │  Worker Thread      │
│  ollama-ext     │ │  weather-ext    │ │  file-search-ext    │
│  (sandboxed)    │ │  (sandboxed)    │ │  (sandboxed)        │
└─────────────────┘ └─────────────────┘ └─────────────────────┘
```

**Permission System**: Extensions declare required permissions in `manifest.json`:

- `network:localhost:11434` - Access specific host/port
- `network:*` - Access any network host
- `provider.register` - Register AI providers
- `tools.register` - Register tools for Stina
- `actions.register` - Register actions
- `settings.register` - Register user-configurable settings
- `storage.collections` - Access collection-based document storage
- `secrets.manage` - Access encrypted secrets storage
- `scheduler.register` - Schedule recurring jobs
- `events.emit` - Emit custom events
- `user.profile.read` - Read user profile information
- `chat.message.write` - Append instructions to chat
- `background.workers` - Run background tasks

**Extension Storage System**: Extensions use a collection-based document storage API (not direct database access):

```typescript
// Storage API - Available via ExtensionContext.storage and ExecutionContext.storage/userStorage
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

// Secrets API - For encrypted credential storage
interface SecretsAPI {
  set(key: string, value: string): Promise<void>
  get(key: string): Promise<string | undefined>
  delete(key: string): Promise<boolean>
  list(): Promise<string[]>
}

// Query syntax (MongoDB-inspired)
interface Query {
  [field: string]: unknown | { $gt?: unknown; $gte?: unknown; $lt?: unknown; $lte?: unknown; $ne?: unknown; $in?: unknown[]; $contains?: string }
}
```

**Manifest Storage Declaration**: Extensions declare collections in `manifest.json`:

```json
{
  "permissions": ["storage.collections", "secrets.manage"],
  "contributes": {
    "storage": {
      "collections": {
        "tasks": { "indexes": ["priority", "done"] },
        "settings": {}
      }
    }
  }
}
```

**Storage Isolation**:
- Extension-scoped: `storage`, `secrets` - shared across all users
- User-scoped: `userStorage`, `userSecrets` - isolated per user (available in ExecutionContext)

### packages/ui-vue

Shared Vue components and platform abstractions. Provides interfaces that apps implement.

```typescript
// Key exports
export { default as GreetingCard } from './components/GreetingCard.vue'
export { applyTheme } from './theme/applyTheme.js'
export { useApi, apiClientKey } from './composables/useApi.js'
export { useApp, provideAppInfo, type AppInfo } from './composables/useApp.js'
export { NotificationService, type NotificationAdapter } from './services/NotificationService.js'
export type { ApiClient } from './composables/useApi.js'
```

**AppInfo** - Environment information provided by each app:

```typescript
interface AppInfo {
  appType: 'electron' | 'web'  // Which app is running
  isWindowed: boolean          // True for Electron (native window)
}

// Apps register via provideAppInfo() in main.ts
provideAppInfo(app, { appType: 'electron', isWindowed: true })

// Components access via useApp()
const { appType, isWindowed } = useApp()
```

**NotificationService** - Platform-agnostic notifications via adapter pattern:

```typescript
// ui-vue provides the interface and service
interface NotificationAdapter {
  show(options: NotificationOptions): Promise<NotificationResult>
  checkWindowFocus(): boolean
  focusWindow(): void
}

// Each app implements its own adapter:
// - apps/electron/src/renderer/services/ElectronNotificationAdapter.ts (native via IPC)
// - apps/web/src/services/WebNotificationAdapter.ts (Web Notifications API)
```

**ApiClient Interface** - The key abstraction for frontend/backend communication:

```typescript
interface ApiClient {
  getGreeting(name?: string): Promise<Greeting>
  getThemes(): Promise<ThemeSummary[]>
  getThemeTokens(id: string): Promise<ThemeTokens>
  getExtensions(): Promise<ExtensionSummary[]>
  health(): Promise<{ ok: boolean }>
}
```

### packages/auth

Authentication and authorization for Stina. Provides WebAuthn (passkey) registration/login, JWT token management, and role-based access control.

```typescript
// Key exports
export { AuthService, TokenService, PasskeyService } from './services/index.js'
export { DefaultUserService, ElectronAuthService } from './services/index.js'
export { authPlugin, requireAuth, requireAdmin, requireRole } from './middleware/index.js'
export type {
  User,
  UserRole,
  CreateUserInput,
  UpdateUserInput,
  TokenPair,
  AccessTokenPayload,
  RefreshTokenPayload,
  RefreshTokenData,
  DeviceInfo,
  AuthResult,
  PasskeyConfig,
  ElectronAuthSession,
} from './types/index.js'
```

**Core Types:**

```typescript
// User entity
interface User {
  id: string
  username: string
  displayName: string | null
  role: UserRole  // 'admin' | 'user'
  createdAt: Date
  updatedAt: Date
  lastLoginAt: Date | null
}

// Token pair returned after login
interface TokenPair {
  accessToken: string   // Short-lived JWT
  refreshToken: string  // Long-lived JWT for renewal
}

// JWT payload for access tokens
interface AccessTokenPayload {
  sub: string          // User ID
  username: string
  role: UserRole
  iat: number          // Issued at
  exp: number          // Expiration
}
```

**Services:**

- **AuthService** - Main authentication orchestrator (registration, login, token refresh)
- **TokenService** - JWT generation and verification
- **PasskeyService** - WebAuthn credential management
- **ElectronAuthService** - PKCE session management for Electron external browser flow

**Middleware:**

- **authPlugin** - Fastify plugin that verifies JWT and populates `request.user`
- **requireAuth** - Prehandler that ensures user is authenticated
- **requireAdmin** - Prehandler that ensures user has admin role
- **requireRole** - Prehandler that checks for specific role

See **"Key Patterns > Authentication"** section below for detailed usage, flow diagrams, and Web vs Electron differences.

### packages/builtin-tools

Core tools that are always available to the AI, registered before extensions load. Built-in tools differ from extension tools in that they are part of Stina's core functionality and don't require user installation.

```typescript
// Key exports
export { registerBuiltinTools } from './index.js'
export { createDateTimeTool } from './tools/index.js'
export type { BuiltinTool, BuiltinToolContext, BuiltinToolFactory } from './types.js'
export type { ToolExecutionContext } from '@stina/chat'
export const BUILTIN_EXTENSION_ID = 'stina.builtin'
```

**Built-in vs Extension Tools**:

| Aspect             | Built-in Tools                  | Extension Tools              |
| ------------------ | ------------------------------- | ---------------------------- |
| Registration       | App startup (before extensions) | Extension activation         |
| Extension ID       | `stina.builtin` (hardcoded)     | Extension's unique ID        |
| Execution          | Direct call via ToolRegistry    | Worker Thread (sandboxed)    |
| Permissions        | Full system access              | Permission-restricted        |
| Distribution       | Bundled with Stina              | Installed separately         |

**Tool Interface**:

```typescript
interface BuiltinTool {
  id: string                    // Unique identifier (e.g., 'stina.builtin.get_datetime')
  name: LocalizedString         // Display name in multiple languages
  description: LocalizedString  // AI-facing description
  parameters?: Record<string, unknown>  // JSON Schema
  execute(params: Record<string, unknown>, executionContext?: ToolExecutionContext): Promise<ToolResult>
}

// Factory function receives context at registration time
type BuiltinToolFactory = (context: BuiltinToolContext) => BuiltinTool

// Context passed during execution (preferred over BuiltinToolContext)
interface ToolExecutionContext {
  timezone?: string  // User's configured timezone (e.g., "Europe/Stockholm")
  userId?: string    // User ID for user-scoped operations
}
```

**Adding a New Built-in Tool**:

1. **Create tool file** in `packages/builtin-tools/src/tools/`:

```typescript
// packages/builtin-tools/src/tools/myTool.ts
import type { BuiltinToolFactory, ToolExecutionContext } from '../types.js'
import { createTranslator } from '@stina/i18n'

const translators = {
  en: createTranslator('en'),
  sv: createTranslator('sv'),
}

export const createMyTool: BuiltinToolFactory = (_context) => ({
  id: 'stina.builtin.my_tool',
  name: {
    en: translators.en.t('tools.builtin.my_tool.name'),
    sv: translators.sv.t('tools.builtin.my_tool.name'),
  },
  description: {
    en: translators.en.t('tools.builtin.my_tool.description'),
    sv: translators.sv.t('tools.builtin.my_tool.description'),
  },
  parameters: {
    type: 'object',
    properties: {
      input: { type: 'string', description: 'Input parameter' },
    },
    required: ['input'],
  },
  execute: async (params, executionContext?: ToolExecutionContext) => {
    // Access user context
    const timezone = executionContext?.timezone || 'UTC'
    const userId = executionContext?.userId

    // Perform tool logic
    const result = doWork(params.input as string, timezone)

    return {
      success: true,
      data: result,
    }
  },
})
```

2. **Export from tools/index.ts**:

```typescript
export { createMyTool } from './myTool.js'
```

3. **Add to builtinToolFactories** in `packages/builtin-tools/src/index.ts`:

```typescript
const builtinToolFactories: BuiltinToolFactory[] = [
  createDateTimeTool,
  createMyTool,  // Add here
]
```

4. **Add translations** in `packages/i18n/src/locales/*/builtin-tools.json`:

```json
{
  "tools": {
    "builtin": {
      "my_tool": {
        "name": "My Tool",
        "description": "Description for AI about when and how to use this tool."
      }
    }
  }
}
```

**Registration in Apps**:

Apps call `registerBuiltinTools()` during initialization, before loading extensions:

```typescript
// apps/api/src/setup.ts or apps/electron/src/main/index.ts
import { registerBuiltinTools } from '@stina/builtin-tools'
import { toolRegistry } from '@stina/chat'
import { getAppSettingsStore } from '@stina/chat/db'
import { APP_NAMESPACE } from '@stina/core'

// Register built-in tools with access to settings
const builtinToolCount = registerBuiltinTools(toolRegistry, {
  getTimezone: async () => {
    const settingsStore = getAppSettingsStore()
    return settingsStore?.get<string>(APP_NAMESPACE, 'timezone')
  },
})

logger.info(`Registered ${builtinToolCount} built-in tools`)
```

**Example: DateTime Tool**:

The `get_datetime` tool provides the AI with current time and timezone information:

```typescript
// Usage from AI perspective:
// Tool call: stina.builtin.get_datetime with no parameters
// Returns:
{
  "success": true,
  "data": {
    "iso": "2026-01-26T14:30:00.000+01:00",
    "epoch_ms": 1737897000000,
    "timezone": "Europe/Stockholm",
    "utc_offset_minutes": 60,
    "utc_offset": "UTC+01:00"
  }
}
```

**Design Notes**:

- `BuiltinToolContext` is deprecated in favor of `ToolExecutionContext` passed to `execute()`
- Tools receive timezone and userId during execution, not registration
- All built-in tools share the extension ID `stina.builtin`
- Registration happens synchronously during app startup
- Tools should validate their parameters and return typed `ToolResult` objects
### packages/scheduler

Job scheduling system for extensions. Enables extensions to schedule tasks using cron expressions, intervals, or one-time execution. All scheduled jobs are user-scoped with userId propagated to execution context.

**Key Exports:**

```typescript
// Core service
export { SchedulerService } from './SchedulerService.js'

// Types
export type {
  SchedulerSchedule,        // Schedule definitions (cron, interval, at)
  SchedulerJobRequest,      // Job registration request
  SchedulerFirePayload,     // Job execution payload
  SchedulerFireEvent,       // Event sent to extension host
  SchedulerServiceOptions,  // Service configuration
  SchedulerMisfirePolicy,   // Misfire handling strategy
  SchedulerDb,              // Database type
} from './SchedulerService.js'

// Database schema
export { schedulerJobs, schedulerSchema } from './schema.js'

// Migration helper
export { getSchedulerMigrationsPath } from './index.js'
```

**Schedule Types:**

```typescript
// One-time execution at specific date/time
{ type: 'at', at: '2024-12-31T23:59:59Z' }

// Recurring with cron expression (supports timezone)
{ type: 'cron', cron: '0 9 * * *', timezone: 'Europe/Stockholm' }

// Recurring interval in milliseconds
{ type: 'interval', everyMs: 3600000 }  // Every hour
```

**Misfire Policies:**

When a job's execution is delayed (e.g., system was offline):

- `run_once` (default): Execute once immediately when detected
- `skip`: Skip missed executions, wait for next scheduled time

**userId Propagation:**

All scheduled jobs MUST include a userId. This enables user-scoped operations when jobs fire:

```typescript
// Extension schedules job (packages/extension-api)
await scheduler.schedule({
  id: 'daily-reminder',
  userId: context.userId,  // Required!
  schedule: { type: 'cron', cron: '0 9 * * *' },
  payload: { message: 'Check your tasks' }
})

// When job fires, extension receives ExecutionContext with userId
scheduler.onFire(async (payload, context) => {
  // context.userId is available for user-scoped operations
  const prefs = await storage.getForUser(context.userId, 'preferences')
  await chat.appendInstruction({
    text: payload.message,
    userId: context.userId,
    conversationId: prefs.defaultConversationId
  })
})
```

**Integration with Extension Host:**

1. **API/Electron Main Process** instantiates SchedulerService:

```typescript
const scheduler = new SchedulerService({
  db: database,
  logger,
  onFire: (event: SchedulerFireEvent) => {
    // Forward to extension host
    return extensionHost.fireScheduledJob(
      event.extensionId,
      event.payload  // includes userId
    )
  }
})

scheduler.start()
```

2. **Extension Host** receives fire event and sends to worker:

```typescript
// ExtensionHost sends to Worker Thread/Web Worker
sendToWorker({
  type: 'scheduler-fire',
  payload: {
    id: jobId,
    userId: payload.userId,      // Propagated from job definition
    scheduledFor, firedAt, delayMs
  }
})
```

3. **Extension Worker** callback receives ExecutionContext:

```typescript
// In extension (packages/extension-api/runtime.ts)
scheduler.onFire((payload, context) => {
  // context.userId available for user-scoped operations
})
```

**Database Schema:**

Table: `scheduler_jobs`

- `id` (PK): `{extensionId}:{jobId}`
- `extension_id`: Extension that owns the job
- `job_id`: Job identifier within extension
- `user_id`: User who owns the job (required)
- `schedule_type`: 'at' | 'cron' | 'interval'
- `schedule_value`: Schedule configuration (date/cron/ms)
- `payload_json`: Optional JSON payload
- `timezone`: Optional timezone for cron jobs
- `misfire_policy`: 'run_once' | 'skip'
- `next_run_at`: Next scheduled execution time (indexed)
- `last_run_at`: Last execution time
- `enabled`: Job active status
- `created_at`, `updated_at`: Timestamps

Indexes:
- `idx_scheduler_jobs_next_run` on `next_run_at` (for efficient scheduling)
- `idx_scheduler_jobs_enabled` on `enabled`
- `idx_scheduler_jobs_user_id` on `user_id`

**Implementation Notes:**

- Uses single setTimeout with MAX_TIMEOUT_MS cap (24.8 days) to avoid overflow
- Timer reschedules automatically after each tick
- Jobs without userId are disabled as legacy (migration 0002 added userId)
- Cron parsing via `cron-parser` library with timezone support
- Job IDs are scoped per-extension: `extensionId:jobId`
- Disable job if extension returns false from onFire handler

### packages/extension-installer

Handles discovery, installation, and management of Stina extensions from the registry and GitHub releases.

```typescript
// Key exports
export { ExtensionInstaller } from './ExtensionInstaller.js'
export { RegistryClient } from './RegistryClient.js'
export { GitHubInstaller } from './GitHubInstaller.js'
export { GitHubService } from './GitHubService.js'
export { ExtensionStorage } from './ExtensionStorage.js'
export type {
  Registry,
  RegistryEntry,
  ExtensionListItem,
  ExtensionDetails,
  VersionInfo,
  InstalledExtension,
  InstallResult,
  SearchOptions,
  ExtensionInstallerOptions,
} from './types.js'
```

**Extension Installation Flow**:

1. **Registry**: Fetch minimal metadata from GitHub registry (`registry.json`)
   - Extension ID, repository URL, categories, verification status
2. **GitHub API**: Enrich with details from GitHub releases and manifest
   - Fetch releases, extract version info, download URLs
   - Fetch `manifest.json` from repository for name/description/author
3. **Download**: Download `.zip` asset from GitHub release
   - Calculate SHA256 hash
   - Verify against verified versions (security check)
4. **Extract**: Unzip to extensions directory
5. **Register**: Save installation metadata in `ExtensionStorage`

```typescript
// Usage example
const installer = new ExtensionInstaller({
  registryUrl: 'https://raw.githubusercontent.com/einord/stina-extensions-registry/main',
  extensionsPath: '/path/to/extensions',
  stinaVersion: '0.20.0',
  platform: 'electron',
  logger,
})

// Browse registry
const available = await installer.getAvailableExtensions()
const details = await installer.getExtensionDetails('ollama-provider')

// Install
const result = await installer.install('ollama-provider', '1.0.0')
if (result.success) {
  console.log(`Installed at ${result.path}`)
  if (result.hashWarning) {
    console.warn(result.hashWarning) // Security warning if hash mismatch
  }
}

// Manage
installer.enable('ollama-provider')
installer.disable('ollama-provider')
await installer.uninstall('ollama-provider')

// Check updates
const updates = await installer.checkForUpdates()
```

**Key Components**:

- **ExtensionInstaller**: Main orchestrator for install/uninstall/update operations
- **RegistryClient**: Fetches and searches the extension registry, enriches with GitHub data
- **GitHubInstaller**: Downloads and extracts extensions from GitHub releases
- **GitHubService**: GitHub API client for fetching releases, manifests, and assets
- **ExtensionStorage**: Local storage for installed extensions metadata

**Security Features**:

- Hash verification for verified extensions (SHA256)
- Platform compatibility checking
- Stina version compatibility checking
- Blocked extensions list in registry

## App Structure

### apps/api (Fastify)

REST API server. Imports core + adapters-node + chat.

- Port: 3001 (default)

#### API Routes

All routes are organized by domain and registered in `apps/api/src/server.ts`:

**Health & Core**
- `GET /health` - Health check with version info
- `GET /hello?name=...` - Simple greeting endpoint

**Themes**
- `GET /themes` - List all available themes
- `GET /themes/:id` - Get theme tokens by ID

**Authentication** (`/auth/*`)
- Setup: `GET /auth/setup/status`, `POST /auth/setup/complete`
- Registration: `POST /auth/register/options`, `POST /auth/register/verify`
- Login: `POST /auth/login/options`, `POST /auth/login/verify`
- Token Management: `POST /auth/refresh`, `POST /auth/logout`
- User Profile: `GET /auth/me` (requires auth)
- Admin: `GET /auth/users`, `PUT /auth/users/:id/role`, `DELETE /auth/users/:id` (admin only)
- Invitations: `POST /auth/users/invite`, `GET /auth/invitations`, `DELETE /auth/invitations/:id` (admin only)

**Electron Auth** (`/auth/electron/*`)
- PKCE flow for external browser auth in Electron
- `POST /auth/electron/session` - Create auth session
- `POST /auth/electron-login/verify` - Verify WebAuthn in browser
- `POST /auth/electron/token` - Exchange code for tokens
- `GET /auth/electron/poll` - Poll for session status

**Chat** (`/chat/*`)
- `GET /chat/conversations` - List user's active conversations (requires auth)
- `GET /chat/conversations/latest` - Get latest active conversation (requires auth)
- `GET /chat/conversations/:id` - Get full conversation with interactions (requires auth)
- `GET /chat/conversations/:id/interactions` - Paginated interactions (requires auth)
- `GET /chat/conversations/:id/interactions/count` - Total interaction count (requires auth)
- `POST /chat/conversations` - Create new conversation (requires auth)
- `POST /chat/conversations/:id/archive` - Archive conversation (requires auth)
- `POST /chat/conversations/:id/interactions` - Save interaction (requires auth)

**Chat Streaming** (`/chat/*`)
- `POST /chat/stream` - Stream chat response via SSE (requires auth)
- `GET /chat/stream/state/:conversationId` - Get current conversation state (requires auth)
- `GET /chat/queue/state` - Get message queue state (requires auth)
- `POST /chat/queue/remove` - Remove queued message (requires auth)
- `POST /chat/queue/reset` - Reset conversation and queue (requires auth)
- `POST /chat/queue/abort` - Abort current streaming (requires auth)
- `GET /chat/events` - Subscribe to chat events (instructions, updates) via SSE (requires auth)

**Settings** (`/settings/*`)
- Model Configs: `GET /settings/ai/models` (requires auth), `POST|PUT|DELETE /settings/ai/models` (admin only)
- User Default Model: `GET|PUT /settings/user/default-model` (requires auth)
- App Settings: `GET|PUT /settings/app` (requires auth)
- Timezones: `GET /settings/timezones` (public)
- Quick Commands: `GET|POST|PUT|DELETE /settings/quick-commands`, `PUT /settings/quick-commands/reorder` (requires auth)

**Extensions** (`/extensions/*`)
- Local: `GET /extensions`, `GET /extensions/providers`, `GET /extensions/events`, `GET /extensions/panels`, `GET /extensions/actions` (requires auth)
- Registry: `GET /extensions/available`, `GET /extensions/search`, `GET /extensions/registry/:id` (requires auth)
- Installed: `GET /extensions/installed`, `POST /extensions/install`, `DELETE /extensions/:id` (admin only for install/delete)
- Management: `POST /extensions/:id/enable|disable|update` (admin only)
- Settings: `GET /extensions/:id/settings` (requires auth), `PUT /extensions/:id/settings` (admin only)
- Tools: `GET /extensions/:id/tools` (requires auth)
- Models: `GET|POST /extensions/providers/:providerId/models` (requires auth)
- Execute: `POST /extensions/actions/:extensionId/:actionId` (requires auth, passes userId to extension)

**Tools** (`/tools/*`)
- `GET /tools/settings` - Get tool settings views (public)
- `POST /tools/execute` - Execute a tool via extension host (requires auth, passes userId to extension)

### apps/web (Vue + Vite)

Web frontend. Uses HTTP-based ApiClient.

- Port: 3002 (dev)
- Proxies `/api/*` to API server
- Provides `createHttpApiClient()` via Vue's provide/inject

### apps/electron

Desktop app with main process and renderer.

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
│       ├── App.vue
│       ├── api/
│       │   └── client.ts  # IPC-based ApiClient
│       └── pages/
│           └── HomePage.vue
├── index.html          # Renderer HTML
├── vite.config.ts      # Renderer bundling
└── tsup.config.ts      # Main/preload bundling
```

**Key insight**: Electron main process imports core + adapters-node directly. No HTTP needed. Renderer communicates via IPC.

### apps/tui (Commander CLI)

Command-line interface. Imports core + adapters-node directly.

## Development Workflow

### Running Apps

```bash
# Web (starts API + Web with shared packages in watch)
pnpm dev:web

# Electron (runs core watch -> dist, tsup watch, Vite renderer, nodemon + Electron)
pnpm dev:electron

# CLI
pnpm dev:tui hello --name Test
pnpm dev:tui theme --list
```

### Building

```bash
pnpm build:packages  # Build only packages (shared, core, adapters-node)
pnpm build           # Build everything including apps
```

### Testing

```bash
pnpm test            # Run all tests
pnpm typecheck       # Type check all packages/apps
pnpm lint            # ESLint
```

## Release Process

Releases use Release-Please and Conventional Commits. Merge to `main` updates a release PR, and merging that PR creates a tag and GitHub release. Only `@stina/extension-api` is intended for npm publish. Full details live in `docs/release-process.md`.

## Implementing New Features

### Adding a new core function

1. **Add to packages/core** (platform-neutral):

   ```typescript
   // packages/core/src/myfeature/myFunction.ts
   export function myFunction(input: string): MyOutput {
     // Pure business logic, no Node/Vue imports
   }
   ```

2. **Export from core index**:

   ```typescript
   // packages/core/src/index.ts
   export { myFunction } from './myfeature/myFunction.js'
   ```

3. **Rebuild packages**: `pnpm build:packages`

### Adding a new API endpoint

1. **Create route file**:

   ```typescript
   // apps/api/src/routes/myroute.ts
   import type { FastifyInstance } from 'fastify'
   import { myFunction } from '@stina/core'

   export async function myRoutes(fastify: FastifyInstance) {
     fastify.get('/myroute', async (request, reply) => {
       return myFunction(request.query.param)
     })
   }
   ```

2. **Register in server.ts**:

   ```typescript
   await fastify.register(myRoutes)
   ```

3. **Add to ApiClient interface** (packages/ui-vue/src/composables/useApi.ts)

4. **Implement in both clients**:
   - apps/web/src/api/client.ts (HTTP)
   - apps/electron/src/renderer/api/client.ts (IPC)

5. **Add IPC handler** (apps/electron/src/main/ipc.ts)

### Adding a new Vue component (shared)

1. **Create in ui-vue**:

   ```vue
   <!-- packages/ui-vue/src/components/MyComponent.vue -->
   <script setup lang="ts">
   import { useApi } from '../composables/useApi.js'
   const api = useApi()
   // Component uses api.* methods, doesn't know if HTTP or IPC
   </script>
   ```

2. **Export from index**:

   ```typescript
   export { default as MyComponent } from './components/MyComponent.vue'
   ```

3. **Use in web and electron renderer** - both import from @stina/ui-vue

### Adding a new theme

Themes are extensions. Add to builtins or create extension manifest:

```typescript
// packages/adapters-node/src/extensions/builtins.ts
export const myThemeExtension: ExtensionManifest = {
  id: 'builtin.my-theme',
  version: '1.0.0',
  name: 'My Theme',
  type: 'theme',
  engines: { app: '>=0.5.0' },
  contributes: {
    themes: [
      {
        id: 'my-theme',
        label: 'My Theme',
        tokens: {
          background: '#...',
          foreground: '#...',
          // ... see ThemeTokens interface
        },
      },
    ],
  },
}
```

## Key Patterns

### Error Handling

```typescript
import { AppError, ErrorCode, Result, ok, err } from '@stina/core'

// Throwing errors
throw new AppError(ErrorCode.THEME_NOT_FOUND, 'Theme not found', { themeId })

// Result type for recoverable errors
function divide(a: number, b: number): Result<number> {
  if (b === 0) return err(new AppError(ErrorCode.VALIDATION_INVALID, 'Division by zero'))
  return ok(a / b)
}
```

### Logging

```typescript
import { createConsoleLogger, getLogLevelFromEnv } from '@stina/adapters-node'
import type { Logger } from '@stina/core'

const logger: Logger = createConsoleLogger(getLogLevelFromEnv())
logger.info('Message', { context: 'value' })
```

### Database (Drizzle + SQLite)

```typescript
import { getDb } from '@stina/adapters-node'
import { appMeta } from '@stina/adapters-node/schema'

const db = getDb()
const result = await db.select().from(appMeta).where(eq(appMeta.key, 'version'))
```

### Authentication

Stina uses WebAuthn (passkey) authentication with JWT tokens. There are two distinct authentication flows:

#### Web Authentication (JWT-based)

**Flow:**
1. User registers/logs in via WebAuthn passkey
2. API returns JWT `accessToken` (short-lived) and `refreshToken` (long-lived)
3. Client stores tokens and includes `Authorization: Bearer <accessToken>` in requests
4. API validates token via `authPlugin` and populates `request.user`

**Middleware:**

```typescript
// Protecting a route (apps/api/src/routes/...)
import { requireAuth, requireAdmin } from '@stina/auth'

// Require any authenticated user
fastify.get('/protected', { preHandler: requireAuth }, async (request) => {
  const userId = request.user!.id  // request.user populated by authPlugin
  // ...
})

// Require admin role
fastify.post('/admin-only', { preHandler: requireAdmin }, async (request) => {
  // Only accessible by users with role === 'admin'
})
```

**Auth Plugin Setup (apps/api/src/server.ts):**

```typescript
import { authPlugin } from '@stina/auth'

await fastify.register(authPlugin, {
  authService,
  requireAuth: true,  // Enable JWT verification
})

// authPlugin adds onRequest hook that:
// 1. Extracts JWT from Authorization header or ?token= query param (for SSE)
// 2. Verifies token and fetches user
// 3. Sets request.user and request.isAuthenticated
```

**Accessing userId in a route:**

```typescript
fastify.get('/my-data', { preHandler: requireAuth }, async (request) => {
  const userId = request.user!.id  // Always available after requireAuth
  const repository = new ConversationRepository(db, userId)
  return repository.listActiveConversations()
})
```

#### Electron Authentication (PKCE-based)

Electron uses a special flow because WebAuthn requires a browser context:

**Flow:**
1. Electron app calls `POST /auth/electron/session` with PKCE challenge
2. Opens system browser to login page with `sessionId`
3. User completes WebAuthn in browser
4. Browser calls `POST /auth/electron-login/verify` with credential
5. Browser redirects to `stina://auth-callback?code=...&state=...` (custom protocol)
6. Electron receives callback, calls `POST /auth/electron/token` with PKCE verifier
7. API returns JWT tokens

**Key files:**
- `apps/api/src/routes/electronAuth.ts` - PKCE endpoints
- `apps/electron/src/main/authProtocol.ts` - Custom protocol handler
- `packages/auth` - `ElectronAuthService` for PKCE session management

**Electron Local Mode:**

In development, Electron can skip auth entirely:

```typescript
// apps/electron/src/main/index.ts
const defaultUserId = 'default-user'  // Single local user

await fastify.register(authPlugin, {
  authService,
  requireAuth: false,  // Disable JWT verification
  defaultUserId,       // All requests use this user
})
```

**Comparing Web vs Electron:**

| Aspect | Web | Electron |
|--------|-----|----------|
| Auth Method | Direct WebAuthn + JWT | External browser PKCE + JWT |
| Token Storage | localStorage | Electron safeStorage (encrypted) |
| User Access | `request.user` from JWT | `request.user` from JWT (after PKCE) or `defaultUserId` (local mode) |
| Middleware | `requireAuth` checks JWT | Same, but local mode bypasses |

### ChatSessionManager

`ChatSessionManager` manages long-lived `ChatOrchestrator` instances across multiple conversations. It prevents creating a new orchestrator for every message and enables session reuse.

**Purpose:**
- Keep orchestrator alive between requests
- Map `conversationId` to existing sessions
- Support multiple parallel conversations (different `sessionId`)
- Handle settings updates by broadcasting to all active sessions

**Location:** `packages/chat/src/sessions/chatSessionManager.ts`

**Usage in API (apps/api/src/routes/chatStream.ts):**

```typescript
// Map of userId -> ChatSessionManager
// Each user gets their own session manager with user-scoped repository
const userSessionManagers = new Map<string, ChatSessionManager>()

async function getSessionManager(userId: string): Promise<ChatSessionManager> {
  let manager = userSessionManagers.get(userId)
  if (!manager) {
    const repository = new ConversationRepository(db, userId)
    const modelConfigProvider = createModelConfigProvider(userId)
    const settingsStore = new AppSettingsStore(userSettings)

    manager = new ChatSessionManager(
      () => new ChatOrchestrator({
        userId,
        repository,
        providerRegistry,
        modelConfigProvider,
        toolRegistry,
        settingsStore,
      }, { pageSize: 10 })
    )
    userSessionManagers.set(userId, manager)
  }
  return manager
}

// In POST /chat/stream route:
const userId = request.user!.id  // From JWT
const sessionManager = await getSessionManager(userId)
const session = sessionManager.getSession({ conversationId })
const orchestrator = session.orchestrator

// Enqueue message and stream events
await orchestrator.enqueueMessage(message, 'user', queueId)
```

**Usage in Electron Main (apps/electron/src/main/ipc.ts):**

```typescript
// Single global session manager for the default user
let sessionManager: ChatSessionManager | null = null

function getOrCreateSessionManager(): ChatSessionManager {
  if (!sessionManager) {
    const repository = new ConversationRepository(db, defaultUserId)
    const modelConfigProvider = createModelConfigProvider(defaultUserId)

    sessionManager = new ChatSessionManager(
      () => new ChatOrchestrator({
        userId: defaultUserId,
        repository,
        providerRegistry,
        toolRegistry,
      }, { pageSize: 10 })
    )
  }
  return sessionManager
}

// IPC handler:
ipcMain.handle('chat-stream-message', async (event, conversationId, message) => {
  const sessionManager = getOrCreateSessionManager()
  const session = sessionManager.getSession({ conversationId })
  await session.orchestrator.enqueueMessage(message, 'user', queueId)
})
```

**Key Methods:**

```typescript
class ChatSessionManager {
  // Get existing session or create new one
  getSession(params: { sessionId?, conversationId? }): ChatSession

  // Find existing session without creating
  findSession(params: { sessionId?, conversationId? }): ChatSession | null

  // Register conversation ID with existing session
  registerConversation(sessionId: string, conversationId: string): void

  // Remove session (destroys orchestrator)
  removeSession(sessionId: string): void

  // Destroy all sessions (e.g., when settings change)
  destroyAllSessions(): void
}
```

**Settings Invalidation Pattern:**

When user settings change (e.g., language, personality), the session manager must be invalidated:

```typescript
// apps/api/src/routes/settings.ts
fastify.put('/settings/app', { preHandler: requireAuth }, async (request) => {
  const userId = request.user!.id
  const updated = await userSettingsRepo.update(request.body)

  // Invalidate the user's session manager so the next chat uses new settings
  await invalidateUserSessionManager(userId)

  return updated
})

// In chatStream.ts:
export async function invalidateUserSessionManager(userId: string): Promise<void> {
  const manager = userSessionManagers.get(userId)
  if (manager) {
    manager.destroyAllSessions()
    userSessionManagers.delete(userId)
  }
}
```

**Session Lifecycle:**

```
User sends message (Web or Electron)
    │
    ▼
Get/create SessionManager for userId
    │
    ▼
Get/create ChatSession for conversationId
    │
    ▼
Orchestrator enqueues message
    │
    ▼
Session stays alive for future messages
    │
    ▼
Settings change → invalidate → destroy all sessions → recreate on next message
```

### Built-in Tools

Built-in tools are registered directly into the tool registry, separate from extension tools. They are always available and don't require extension loading.

**Location:** `packages/builtin-tools/src/`

**Key Differences:**

| Aspect | Built-in Tools | Extension Tools |
|--------|---------------|----------------|
| Registration | Direct via `registerBuiltinTools()` | Via `ExtensionHost` worker messages |
| Lifecycle | Registered once at app startup | Loaded/unloaded with extensions |
| Execution | Inline function call | IPC to Worker Thread |
| Context | `ToolExecutionContext` | `ExecutionContext` (includes `extension` info) |
| Extension ID | `'stina.builtin'` | Extension-specific ID |
| Permissions | No sandboxing | Sandboxed, permission-checked |

**Registration Flow:**

```typescript
// apps/api/src/setup.ts (or apps/electron/src/main/index.ts)
import { registerBuiltinTools } from '@stina/builtin-tools'
import { toolRegistry } from '@stina/chat'

// Register built-in tools BEFORE extension runtime
const builtinCount = registerBuiltinTools(toolRegistry, {
  getTimezone: async () => {
    const settingsStore = getAppSettingsStore()
    return settingsStore?.get<string>(APP_NAMESPACE, 'timezone')
  },
})
logger.info('Registered built-in tools', { count: builtinCount })

// THEN load extensions (which register extension tools)
await setupExtensions(logger, options)
```

**Example: Date/Time Tool (packages/builtin-tools/src/tools/dateTime.ts):**

```typescript
export function createDateTimeTool(context: BuiltinToolContext): BuiltinTool {
  return {
    id: 'date_time',
    name: 'Get current date and time',
    description: 'Get the current date and time',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    execute: async (_params, executionContext) => {
      // Get timezone from user settings via context
      const timezone = await context.getTimezone()
      const now = new Date()

      if (timezone) {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          dateStyle: 'full',
          timeStyle: 'long',
        })
        return {
          success: true,
          data: {
            datetime: formatter.format(now),
            timezone,
            iso: now.toISOString(),
          },
        }
      }

      return {
        success: true,
        data: {
          datetime: now.toString(),
          iso: now.toISOString(),
        },
      }
    },
  }
}
```

**Execution Flow:**

```
AI decides to call tool "date_time"
    │
    ▼
ChatOrchestrator.executeTool('date_time', params)
    │
    ▼
toolRegistry.get('date_time')
    │
    ▼
Check if extensionId === 'stina.builtin'
    │
    ├─► Built-in: Call tool.execute() directly
    │       │
    │       ▼
    │   Return result immediately
    │
    └─► Extension: Route to ExtensionHost
            │
            ▼
        Send IPC to Worker Thread
            │
            ▼
        Execute in sandboxed worker
            │
            ▼
        Return result via IPC
```

**Adding a New Built-in Tool:**

1. Create tool factory in `packages/builtin-tools/src/tools/`:

```typescript
// myTool.ts
export function createMyTool(context: BuiltinToolContext): BuiltinTool {
  return {
    id: 'my_tool',
    name: 'My tool',
    description: 'Does something useful',
    parameters: { /* JSON Schema */ },
    execute: async (params, executionContext) => {
      // Access user settings via context
      const timezone = await context.getTimezone()

      // Implement tool logic
      return { success: true, data: { result: '...' } }
    },
  }
}
```

2. Add to factory list in `packages/builtin-tools/src/index.ts`:

```typescript
const builtinToolFactories: BuiltinToolFactory[] = [
  createDateTimeTool,
  createMyTool,  // Add here
]
```

3. Tool is automatically registered on app startup

**Why Built-in Tools?**

- **Performance**: No IPC overhead for frequently-used tools
- **Bootstrapping**: Available before any extensions load
- **Security**: Trusted code that can access internal APIs directly
- **Simplicity**: No extension manifest, permissions, or sandboxing needed

### Extension UI Components

Extensions can define dynamic UI components for panels and tool settings views using a declarative component DSL. This allows extensions to create rich UIs without writing Vue code directly.

**Panel Views**

Extensions contribute panel views via `manifest.json`:

```typescript
{
  "contributes": {
    "panels": [
      {
        "id": "todo-panel",
        "title": "Todo List",
        "icon": "checkList",
        "view": {
          "kind": "component",
          "data": {
            "projects": {
              "action": "getProjectsWithTodos",
              "refreshOn": ["todo.changed", "project.changed"]
            }
          },
          "content": {
            "component": "VerticalStack",
            "gap": 16,
            "children": {
              "each": "$projects",
              "as": "project",
              "items": [
                {
                  "component": "Panel",
                  "title": "$project.name",
                  "content": {
                    "component": "VerticalStack",
                    "gap": 8,
                    "children": {
                      "each": "$project.todos",
                      "as": "todo",
                      "items": [
                        {
                          "component": "Checkbox",
                          "label": "$todo.title",
                          "checked": "$todo.completed",
                          "onChangeAction": {
                            "action": "toggleTodo",
                            "params": { "todoId": "$todo.id" }
                          }
                        }
                      ]
                    }
                  }
                }
              ]
            }
          }
        }
      }
    ]
  }
}
```

**Tool Settings Views**

Extensions can define settings views for managing extension-specific data:

```typescript
{
  "contributes": {
    "toolSettings": [
      {
        "id": "projects-view",
        "title": "Projects",
        "description": "Manage your projects and tasks",
        "view": {
          "kind": "list",
          "listToolId": "listProjects",
          "getToolId": "getProject",
          "upsertToolId": "upsertProject",
          "deleteToolId": "deleteProject",
          "mapping": {
            "itemsKey": "projects",
            "idKey": "id",
            "labelKey": "name",
            "descriptionKey": "description"
          },
          "searchParam": "query",
          "limitParam": "limit"
        },
        "fields": [
          {
            "id": "name",
            "title": "Project Name",
            "type": "string",
            "validation": { "required": true }
          },
          {
            "id": "description",
            "title": "Description",
            "type": "string"
          }
        ]
      }
    ]
  }
}
```

Tool settings views can also use the `"kind": "component"` approach for fully custom UIs, identical to panel views.

**Available Components**

Layout components:
- **VerticalStack**: Vertical layout with gap
- **HorizontalStack**: Horizontal layout with gap
- **Grid**: CSS grid layout with columns
- **Panel**: Container with header, description, icon, and action buttons
- **Collapsible**: Expandable section with title and content

Text components:
- **Header**: Heading with level, title, description, and icon
- **Label**: Simple text label
- **Paragraph**: Paragraph text
- **Markdown**: Markdown content renderer

Interactive components:
- **Button**: Button with text and onClick action
- **IconButton**: Icon button with tooltip and onClick action
- **TextInput**: Text input field with label and onChange action
- **DateTimeInput**: Date/time picker with onChange action
- **Select**: Dropdown select with options and onChange action
- **Toggle**: Toggle switch with label and onChange action
- **Checkbox**: Checkbox with label and onChange action

Visual components:
- **Divider**: Horizontal divider line
- **Icon**: Icon from huge-icons library
- **Pill**: Colored badge/pill with text and optional icon
- **Modal**: Modal dialog with title, body, footer, and onClose action

**Data Flow & Scope**

1. **Data Sources**: Panel/view definitions specify data sources via actions
2. **Action Execution**: UI layer fetches data by calling extension actions
3. **Scope Variables**: Data is made available as `$variableName` in components
4. **Iterators**: Use `{ "each": "$items", "as": "item", "items": [...] }` for lists
5. **Action Calls**: Components can trigger actions with `{ "action": "actionId", "params": {...} }`
6. **Refresh Events**: Data sources can refresh when specific events are emitted

**Styling**

Components support limited inline CSS via the `style` property:

```typescript
{
  "component": "Panel",
  "title": "My Panel",
  "style": {
    "background-color": "#f5f5f5",
    "border-radius": "8px",
    "padding": "1rem"
  }
}
```

Only safe CSS properties are allowed (no `position`, `z-index`, `url()`, etc.) to prevent UI spoofing and security issues.

**Implementation**

- **ExtensionComponent.vue**: Dynamically renders components based on `component` property
- **ExtensionScopeProvider.vue**: Provides scope context for variable resolution
- **PanelComponentRenderer.vue**: Fetches data, manages scope, handles refresh events
- **useExtensionScope**: Composable for accessing and resolving scope variables
- **resolveComponentProps**: Resolves `$variable` references in component props

## File Naming Conventions

- TypeScript files: `camelCase.ts`
- Vue components: `PascalCase.vue`
- Test files: `*.test.ts` in `__tests__/` folders
- Config files: lowercase with dots (e.g., `tsup.config.ts`)

## CSS Conventions

Always use **nested CSS with tree structure** in Vue components. This keeps styles organized and reflects the DOM hierarchy.

### Rules

1. **Use `>` for direct children** - Always use the child combinator to scope styles precisely
2. **Use `&` for modifiers** - Pseudo-classes (`:hover`, `:focus`, `:disabled`) and states
3. **Nest deeply** - Mirror the component's template structure in CSS
4. **Use CSS variables** - For theming, always provide fallbacks

### Example

```vue
<template>
  <div class="my-component">
    <header class="header">
      <h1>Title</h1>
      <button class="action-button">Click</button>
    </header>
    <main class="content">
      <p class="description">Text</p>
    </main>
  </div>
</template>

<style scoped>
.my-component {
  padding: 1rem;
  background: var(--color-background, #ffffff);

  > .header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 1rem;

    > h1 {
      font-size: 1.5rem;
      color: var(--color-foreground, #1a1a2e);
    }

    > .action-button {
      padding: 0.5rem 1rem;
      background: var(--color-primary, #6366f1);
      border: none;
      border-radius: var(--radius, 0.5rem);
      cursor: pointer;

      &:hover {
        opacity: 0.9;
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
  }

  > .content {
    > .description {
      line-height: 1.6;
      color: var(--color-muted, #6b7280);
    }
  }
}
</style>
```

### Anti-patterns (avoid)

```css
/* ✗ Flat selectors without nesting */
.my-component {
}
.my-component .header {
}
.my-component .header h1 {
}

/* ✗ Missing child combinator */
.my-component {
  .header {
  } /* Should be > .header */
}

/* ✗ Separate hover rules */
.button {
}
.button:hover {
} /* Should use & inside .button */
```

## Import Conventions

Always use `.js` extension in imports (ESM):

```typescript
import { something } from './myfile.js' // ✓
import { something } from './myfile' // ✗
```

## Common Issues

### "Cannot find module" errors

- Run `pnpm build:packages` to rebuild
- Check that the export is in the package's `index.ts`

### Electron shows white screen

- Ensure Vite renderer is running on correct port (3003)
- Check `RENDERER_PORT` env variable
- Verify preload script is built

### Type errors across packages

- Run `pnpm typecheck` to see all errors
- Ensure package dependencies are correct in package.json
- Check that types are exported from package index

## Quick Reference

| Task               | Command                  |
| ------------------ | ------------------------ |
| Start web dev      | `pnpm dev:web`           |
| Start electron dev | `pnpm dev:electron`      |
| Run CLI            | `pnpm dev:tui <command>` |
| Build everything   | `pnpm build`             |
| Run tests          | `pnpm test`              |
| Type check         | `pnpm typecheck`         |
| Lint               | `pnpm lint`              |

| Port | Service                      |
| ---- | ---------------------------- |
| 3001 | API server                   |
| 3002 | Web dev server               |
| 3003 | Electron renderer dev server |

| Package        | Purpose              | Environment   | Can import                       |
| -------------- | -------------------- | ------------- | -------------------------------- |
| shared         | Types/DTOs           | Any           | Nothing                          |
| core           | Business logic       | Any (pure TS) | shared, i18n                     |
| chat           | Chat orchestration   | Node.js only  | shared, core, i18n, Node.js APIs |
| extension-api  | Extension types      | Any           | shared                           |
| extension-host | Extension management | Node.js only  | extension-api, core, shared      |
| adapters-node  | Node implementations | Node.js only  | shared, core, Node.js APIs       |
| ui-vue         | Vue components       | Browser only  | shared, core (types only), Vue   |
| apps/api       | REST API             | Node.js       | All Node.js packages             |
| apps/tui       | CLI                  | Node.js       | All Node.js packages             |
| apps/electron  | Desktop (main)       | Node.js       | All Node.js packages             |
| apps/electron  | Desktop (renderer)   | Browser       | ui-vue only (via IPC to main)    |
| apps/web       | Web frontend         | Browser       | ui-vue only (via HTTP to API)    |

## Signal Flow & Context Propagation

This section describes how signals flow between clients (web/electron/ui-vue) and how context objects and userId information propagate through the system.

### Overview: Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER LAYER                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         UI (Vue Components)                          │   │
│  │    ChatView.vue  ──►  ChatView.service.ts  ──►  ApiClient           │   │
│  └────────────────────────────────┬────────────────────────────────────┘   │
│                                   │                                         │
│                    ┌──────────────┴──────────────┐                         │
│                    │                             │                          │
│               [Web: HTTP/SSE]             [Electron: IPC]                  │
└────────────────────┼─────────────────────────────┼──────────────────────────┘
                     │                             │
┌────────────────────┼─────────────────────────────┼──────────────────────────┐
│                    ▼                             ▼                          │
│  ┌─────────────────────────┐     ┌─────────────────────────────────┐       │
│  │      apps/api           │     │    apps/electron (main)          │       │
│  │   chatStream.ts         │     │         ipc.ts                   │       │
│  │  ┌───────────────────┐  │     │  ┌───────────────────────────┐  │       │
│  │  │ SessionManager    │  │     │  │ SessionManager            │  │       │
│  │  │  └─ userId        │  │     │  │  └─ userId                │  │       │
│  │  │  └─ orchestrator  │  │     │  │  └─ orchestrator          │  │       │
│  │  └───────────────────┘  │     │  └───────────────────────────┘  │       │
│  └────────────┬────────────┘     └──────────────┬──────────────────┘       │
│               │                                 │                           │
│               └────────────────┬────────────────┘                           │
│                                ▼                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      ChatOrchestrator                                 │  │
│  │   deps: { userId, repository, providerRegistry, toolRegistry }        │  │
│  │                                                                       │  │
│  │   ┌──────────────┐     ┌──────────────┐     ┌──────────────────┐    │  │
│  │   │  AI Provider │ ◄─► │ Tool Executor│ ◄─► │ ExtensionHost    │    │  │
│  │   │  (streaming) │     │  (userId)    │     │ (Worker Threads) │    │  │
│  │   └──────────────┘     └──────────────┘     └──────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    NODE.JS LAYER                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Context Types

The system uses different context types at different layers:

#### 1. ChatOrchestratorDeps (packages/chat)

Injected when creating ChatOrchestrator. Contains userId for the session:

```typescript
interface ChatOrchestratorDeps {
  userId?: string                     // User ID for tool execution context
  repository: IConversationRepository // User-scoped repository
  providerRegistry: ProviderRegistry
  settingsStore?: SettingsStore
  toolRegistry?: ToolRegistry
}
```

#### 2. ToolExecutionContext (packages/chat)

Passed to every tool when executed:

```typescript
interface ToolExecutionContext {
  timezone?: string  // User's timezone from settings
  userId?: string    // User ID for user-scoped operations
}
```

#### 3. ExecutionContext (packages/extension-api)

Passed to extension tools, actions, scheduler callbacks, and background tasks:

```typescript
interface ExecutionContext {
  readonly userId?: string  // Always defined for tool/action execution
  readonly extension: {
    readonly id: string
    readonly version: string
    readonly storagePath: string
  }
  // Storage APIs (collection-based document storage)
  readonly storage: StorageAPI      // Extension-scoped storage
  readonly userStorage: StorageAPI  // User-scoped storage (isolated per user)
  // Secrets APIs (encrypted credential storage)
  readonly secrets: SecretsAPI      // Extension-scoped secrets
  readonly userSecrets: SecretsAPI  // User-scoped secrets (isolated per user)
}
```

### Flow Diagrams

#### Scenario 1: User Sends a Chat Message (Web)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. USER INPUT                                                            │
│    ChatInput.vue → emits 'submit' with message text                      │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 2. SERVICE LAYER                                                         │
│    ChatView.service.ts:                                                  │
│    - Creates SSE connection to POST /chat/stream                         │
│    - Sends: { message, conversationId }                                  │
│    - Auth header contains JWT with userId                                │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │ HTTP + SSE
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 3. API ROUTE (apps/api/src/routes/chatStream.ts)                         │
│                                                                          │
│    const userId = request.user!.id  // From JWT via requireAuth          │
│    const sessionManager = await getSessionManager(userId)                │
│    const session = sessionManager.getSession({ conversationId })         │
│    const orchestrator = session.orchestrator  // Has userId in deps      │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 4. ORCHESTRATOR (packages/chat)                                          │
│                                                                          │
│    orchestrator.enqueueMessage(message, 'user', queueId)                 │
│      → Creates Interaction                                               │
│      → Emits 'interaction-started'                                       │
│      → Calls provider.sendMessage(messages, systemPrompt, callback)      │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
              ┌──────────────────────┴──────────────────────┐
              │                                             │
              ▼                                             ▼
┌─────────────────────────────┐          ┌─────────────────────────────────┐
│ 5a. AI PROVIDER             │          │ 5b. TOOL EXECUTION (if needed)  │
│     (Streaming response)    │          │                                 │
│                             │          │   toolExecutor(toolId, params)  │
│ Emits:                      │          │     → toolRegistry.get(toolId)  │
│ - 'thinking-update'         │          │     → executionContext = {      │
│ - 'content-update'          │          │         timezone,               │
│ - 'tool-start'              │          │         userId: deps.userId     │
│ - 'tool-complete'           │          │       }                         │
│ - 'done'                    │          │     → tool.execute(params, ctx) │
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
│ 6. EVENTS STREAM BACK                                                    │
│                                                                          │
│    orchestrator.on('event', (event) => {                                 │
│      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)               │
│    })                                                                    │
│                                                                          │
│    Events: interaction-started → thinking-update → content-update →      │
│            tool-start → tool-complete → stream-complete →                │
│            interaction-saved                                             │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │ SSE
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 7. UI UPDATES                                                            │
│                                                                          │
│    ChatView.service.ts parses SSE events                                 │
│      → Updates reactive state (streamingContent, etc.)                   │
│      → Vue components re-render                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

#### Scenario 2: Scheduled Job Triggers Chat (Extension)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. SCHEDULER FIRES                                                       │
│                                                                          │
│    SchedulerService detects job is due                                   │
│    Job was created with: { userId: "user-123", ... }                     │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 2. EXTENSION HOST NOTIFIES WORKER                                        │
│                                                                          │
│    sendToWorker({                                                        │
│      type: 'scheduler-fire',                                             │
│      payload: {                                                          │
│        id: jobId,                                                        │
│        userId: "user-123",  // From job definition                       │
│        scheduledFor, firedAt, delayMs                                    │
│      }                                                                   │
│    })                                                                    │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 3. EXTENSION CALLBACK                                                    │
│                                                                          │
│    // In extension worker (runtime.ts)                                   │
│    scheduler.onFire((payload, context) => {                              │
│      // context.userId = "user-123"                                      │
│      // Can use user-scoped storage:                                     │
│      const prefs = await storage.getForUser(context.userId, 'prefs')     │
│                                                                          │
│      // Send instruction to chat:                                        │
│      await chat.appendInstruction({                                      │
│        text: "Reminder: Check your tasks",                               │
│        userId: context.userId                                            │
│      })                                                                  │
│    })                                                                    │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 4. CHAT API (via extension bridge)                                       │
│                                                                          │
│    // chatStream.ts or electron/main/index.ts                            │
│    queueInstructionForUser(userId, message, conversationId)              │
│      → Gets/creates SessionManager for userId                            │
│      → orchestrator.enqueueMessage(message, 'instruction')               │
│      → Emits chat-event: { type: 'instruction-received', userId }        │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 5. NOTIFICATION TO CLIENTS                                               │
│                                                                          │
│    // All clients subscribed to GET /chat/events receive:                │
│    emitChatEvent({                                                       │
│      type: 'instruction-received',                                       │
│      userId: "user-123",                                                 │
│      conversationId: "conv-456"                                          │
│    })                                                                    │
│                                                                          │
│    // Only clients with matching userId see the event                    │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 6. UI NOTIFICATION                                                       │
│                                                                          │
│    // chatEventClient.ts receives event                                  │
│    // Triggers notification if window not focused                        │
│    NotificationService.notify({                                          │
│      title: "New message",                                               │
│      body: "Reminder: Check your tasks"                                  │
│    })                                                                    │
└──────────────────────────────────────────────────────────────────────────┘
```

#### Scenario 3: Electron IPC Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. RENDERER PROCESS (Vue)                                                │
│                                                                          │
│    // Uses IPC-based ApiClient                                           │
│    window.stina.chat.streamMessage(conversationId, message)              │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │ IPC (contextBridge)
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 2. PRELOAD BRIDGE                                                        │
│                                                                          │
│    // preload/index.ts exposes safe API                                  │
│    contextBridge.exposeInMainWorld('stina', {                            │
│      chat: {                                                             │
│        streamMessage: (convId, msg) =>                                   │
│          ipcRenderer.invoke('chat-stream-message', convId, msg)          │
│      }                                                                   │
│    })                                                                    │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │ IPC invoke
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 3. MAIN PROCESS (apps/electron/src/main/ipc.ts)                          │
│                                                                          │
│    ipcMain.handle('chat-stream-message', async (event, convId, msg) => { │
│      const userId = defaultUserId  // Electron has single user           │
│      const session = sessionManager.getSession({ conversationId })       │
│      const orchestrator = session.orchestrator                           │
│                                                                          │
│      orchestrator.on('event', (orcEvent) => {                            │
│        // Transform and send to renderer                                 │
│        sender.send('chat-stream-event', transformedEvent)                │
│      })                                                                  │
│                                                                          │
│      await orchestrator.enqueueMessage(msg, 'user', queueId)             │
│    })                                                                    │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │ IPC send
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 4. RENDERER RECEIVES EVENTS                                              │
│                                                                          │
│    ipcRenderer.on('chat-stream-event', (event, data) => {                │
│      // Update reactive state, same as Web SSE flow                      │
│    })                                                                    │
└──────────────────────────────────────────────────────────────────────────┘
```

### Message Protocol: Host ↔ Extension Worker

Extensions run in isolated Worker Threads. Communication uses a typed message protocol:

#### Host → Worker Messages

| Message Type              | Purpose                           | userId Included |
| ------------------------- | --------------------------------- | --------------- |
| `activate`                | Initialize extension              | No              |
| `deactivate`              | Shutdown extension                | No              |
| `scheduler-fire`          | Scheduled job triggered           | Yes             |
| `tool-execute-request`    | Execute a registered tool         | Yes             |
| `action-execute-request`  | Execute a registered action       | Yes             |
| `provider-chat-request`   | Request chat completion           | No              |
| `settings-changed`        | Setting value updated             | No              |

#### Worker → Host Messages

| Message Type              | Purpose                           |
| ------------------------- | --------------------------------- |
| `ready`                   | Worker initialized                |
| `provider-registered`     | AI provider available             |
| `tool-registered`         | Tool available for use            |
| `action-registered`       | Action available for UI           |
| `tool-execute-response`   | Tool execution result             |
| `action-execute-response` | Action execution result           |
| `stream-event`            | Streaming chat response chunk     |
| `request`                 | API call (network, storage, etc.) |

### Event Types (OrchestratorEvent)

Events emitted by ChatOrchestrator during streaming:

| Event Type            | Payload                                        | When Emitted                    |
| --------------------- | ---------------------------------------------- | ------------------------------- |
| `conversation-created`| `{ conversation }`                             | New conversation started        |
| `interaction-started` | `{ interactionId, conversationId, role, text }`| Message processing begins       |
| `thinking-update`     | `{ text }`                                     | AI thinking content (streaming) |
| `thinking-done`       | -                                              | AI thinking complete            |
| `content-update`      | `{ text }`                                     | AI response content (streaming) |
| `tool-start`          | `{ name }`                                     | Tool execution begins           |
| `tool-complete`       | `{ tool: ToolCall }`                           | Tool execution finished         |
| `stream-complete`     | `{ messages }`                                 | Streaming finished              |
| `stream-error`        | `{ error }`                                    | Error during streaming          |
| `interaction-saved`   | `{ interaction }`                              | Interaction persisted to DB     |
| `queue-update`        | `{ queue: QueueState }`                        | Message queue changed           |
| `state-change`        | -                                              | Orchestrator state changed      |

All events include `queueId` to correlate with the original request.

### Chat Events (Cross-Client Notifications)

Events broadcast to all connected clients via SSE (`GET /chat/events`) or IPC:

| Event Type             | Purpose                              |
| ---------------------- | ------------------------------------ |
| `interaction-saved`    | New interaction saved (refresh UI)   |
| `instruction-received` | Background instruction queued        |

Clients filter events by `userId` to only process their own events:

```typescript
// In chatEventClient.ts
chatEventEmitter.on('chat-event', (event: ChatEvent) => {
  if (event.userId === currentUserId) {
    // Handle event
  }
})
```

### userId Propagation Summary

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
│       │ Creates ExecutionContext                                        │
│       ▼                                                                 │
│  [Extension Tool: execute(params, context)]                             │
│       │                                                                 │
│       │ context.userId available for user-scoped operations             │
│       ▼                                                                 │
│  [storage.getForUser(context.userId, key)]                              │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Request-scoped context** - No global mutable state. userId flows explicitly through each layer.

2. **User-scoped repositories** - `ConversationRepository` is created per-user, ensuring data isolation.

3. **Event correlation** - All events include `queueId` to match responses with requests.

4. **Consistent interface** - Web (SSE) and Electron (IPC) use the same event types and data structures.

5. **Extension isolation** - Extensions receive `ExecutionContext` with `userId`, `storage`/`userStorage`, and `secrets`/`userSecrets` APIs. User-scoped APIs provide automatic data isolation per user without direct database access.
