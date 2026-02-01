# AI Agent Instructions

This document provides context for AI agents working on the Stina codebase.

> **Detailed documentation**: See `docs/` for comprehensive guides. This file contains essential rules and overview.

## Critical Rules

These rules MUST always be followed:

### Package Layer Rules

| Package | Environment | Can Import | Cannot Import |
|---------|-------------|------------|---------------|
| `packages/core` | Pure TypeScript | shared, i18n | Node.js APIs, Vue, browser APIs |
| `packages/chat` | Node.js | shared, core, i18n, Node.js APIs | Vue, browser APIs |
| `packages/ui-vue` | Browser | shared, core (types only), Vue | Node.js APIs |
| `packages/adapters-node` | Node.js | shared, core, Node.js APIs | Vue, browser APIs |

**Violating these rules breaks the build or causes runtime errors.**

### Import Conventions

Always use `.js` extension in imports (ESM):

```typescript
import { something } from './myfile.js'  // ✓
import { something } from './myfile'     // ✗
```

### CSS Conventions

Always use **nested CSS with `>` for direct children**:

```css
/* ✓ Correct */
.my-component {
  > .header {
    > h1 { font-size: 1.5rem; }
    > .button { &:hover { opacity: 0.9; } }
  }
}

/* ✗ Wrong - missing child combinator */
.my-component {
  .header { }
  .header h1 { }
}
```

### Vue Component Reuse

**Always check for existing components before creating new ones.** The `packages/ui-vue/src/components/` directory contains reusable components.

When creating new UI elements:
1. **Search first** - Look for existing components that solve the same problem
2. **Extend, don't duplicate** - If a similar component exists, consider extending it with props
3. **Design for reuse** - When creating new components, make them generic enough to be reused elsewhere

```typescript
// ✓ Reuse existing components
import { BaseButton, BaseCard, BaseModal } from '@stina/ui-vue'

// ✗ Don't create one-off components for common patterns
// Instead, use or extend the existing base components
```

### Extension ID for Built-in Tools

Built-in tools use `BUILTIN_EXTENSION_ID = 'stina.builtin'`. Never hardcode this string.

---

## Project Overview

**Stina** is an AI assistant chat application built as a TypeScript monorepo.

- **Package Manager**: pnpm with workspaces
- **Node.js**: >=20 required
- **Architecture**: Multiple frontends (Web, Electron, CLI) sharing core business logic

## Architecture

The codebase has two layers:

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
│         └────────────────┼───────────────────────┘                   │
│                          ▼                                           │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  packages/chat, packages/extension-host, packages/adapters-node│  │
│  └────────────────────────────────┬───────────────────────────────┘  │
│                                   ▼                                   │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                      packages/core                              │  │
│  │         (Pure TypeScript: business logic, interfaces)          │  │
│  └────────────────────────────────┬───────────────────────────────┘  │
│                                   ▼                                   │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                     packages/shared (Types, DTOs)               │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

> **See**: [docs/architecture.md](docs/architecture.md) for detailed diagrams and patterns.

### Key Design Principles

1. **`packages/core` is pure TypeScript** - No Node.js, browser, or framework imports
2. **`packages/chat` runs in Node.js** - Can use Node.js APIs, NOT Vue/browser APIs
3. **`packages/ui-vue` is browser-only** - Vue components, no business logic
4. **Apps are thin wrappers** - Wire dependencies, call core/chat, minimal logic
5. **ApiClient pattern** - Web uses HTTP, Electron uses IPC, same interface
6. **Streaming pattern** - Web uses SSE via API, Electron/TUI use ChatOrchestrator directly

---

## Package Summaries

### packages/shared

Pure TypeScript types and DTOs. No runtime code.

```typescript
export interface Greeting { message: string; timestamp: string }
export interface ThemeSummary { id: string; label: string }
export interface ExtensionSummary { id: string; name: string; version: string; type: 'feature' | 'theme' }
```

### packages/core

Platform-neutral business logic. Defines interfaces, implements registries.

```typescript
export { getGreeting } from './hello/getGreeting.js'
export { ExtensionRegistry } from './extensions/registry.js'
export { themeRegistry } from './themes/themeRegistry.js'
export { AppError, ErrorCode } from './errors/AppError.js'
export type { Logger, SettingsStore, ThemeTokens } from './...'
```

**Important**: Core defines interfaces (Logger, SettingsStore) but does NOT implement them.

### packages/adapters-node

Node.js-specific implementations. Database, file I/O, encryption.

```typescript
export { getDb, closeDb } from './db/connection.js'
export { runMigrations } from './db/migrate.js'
export { loadExtensions } from './extensions/loader.js'
export { createConsoleLogger } from './logging/consoleLogger.js'
export { EncryptedSettingsStore } from './settings/encryptedSettingsStore.js'
```

### packages/chat

Chat orchestration. All chat business logic belongs here.

```typescript
export { ChatOrchestrator } from './orchestrator/ChatOrchestrator.js'
export { ChatStreamService } from './services/ChatStreamService.js'
export { conversationService } from './services/ConversationService.js'
export { providerRegistry } from './providers/index.js'
```

**ChatOrchestrator Pattern**:
- Electron/TUI: Instantiate directly with `ConversationRepository`
- API: Instantiate per-request, expose via SSE endpoint
- Vue: Thin SSE client - only handles reactivity

> **See**: [docs/packages/chat.md](docs/packages/chat.md) for detailed patterns.

### packages/extension-api

Types and runtime for building Stina extensions. Used by extensions, not Stina itself.

```typescript
export type { ExtensionManifest, Permission, AIProvider, Tool } from './types.js'
export type { ExtensionContext, Disposable } from './types.js'
export { initializeExtension } from './runtime.js'
```

> **See**: [docs/packages/extension-api.md](docs/packages/extension-api.md)

### packages/extension-host

Extension lifecycle management and permission enforcement.

```typescript
export { ExtensionHost } from './ExtensionHost.js'
export { NodeExtensionHost } from './NodeExtensionHost.js'
export { PermissionChecker } from './PermissionChecker.js'
export { validateManifest } from './ManifestValidator.js'
```

**Permission System**: Extensions declare permissions in `manifest.json`:
- `network:localhost:11434`, `network:*` - Network access
- `provider.register`, `tools.register`, `actions.register` - Registration
- `storage.collections`, `secrets.manage` - Storage
- `scheduler.register`, `events.emit` - System

> **See**: [docs/packages/extension-host.md](docs/packages/extension-host.md) for full permission list.

### packages/auth

WebAuthn (passkey) authentication with JWT tokens.

```typescript
export { AuthService, TokenService, PasskeyService } from './services/index.js'
export { authPlugin, requireAuth, requireAdmin } from './middleware/index.js'
```

> **See**: [docs/packages/auth.md](docs/packages/auth.md) and [docs/patterns/authentication.md](docs/patterns/authentication.md)

### packages/builtin-tools

Core tools always available to the AI, registered before extensions.

```typescript
export { registerBuiltinTools } from './index.js'
export { createDateTimeTool } from './tools/index.js'
export const BUILTIN_EXTENSION_ID = 'stina.builtin'
```

> **See**: [docs/packages/builtin-tools.md](docs/packages/builtin-tools.md)

### packages/scheduler

Job scheduling for extensions with cron, interval, or one-time execution.

```typescript
export { SchedulerService } from './SchedulerService.js'
export type { SchedulerSchedule, SchedulerJobRequest } from './SchedulerService.js'
```

> **See**: [docs/packages/scheduler.md](docs/packages/scheduler.md)

### packages/extension-installer

Extension discovery, installation, and management from registry/GitHub.

```typescript
export { ExtensionInstaller } from './ExtensionInstaller.js'
export { RegistryClient } from './RegistryClient.js'
```

> **See**: [docs/packages/extension-installer.md](docs/packages/extension-installer.md)

### packages/ui-vue

Shared Vue components and platform abstractions.

```typescript
export { default as GreetingCard } from './components/GreetingCard.vue'
export { applyTheme } from './theme/applyTheme.js'
export { useApi, apiClientKey } from './composables/useApi.js'
export { useApp, provideAppInfo } from './composables/useApp.js'
```

**ApiClient Interface** - The key abstraction:

```typescript
interface ApiClient {
  getGreeting(name?: string): Promise<Greeting>
  getThemes(): Promise<ThemeSummary[]>
  getExtensions(): Promise<ExtensionSummary[]>
  health(): Promise<{ ok: boolean }>
}
```

---

## App Structure

### apps/api (Fastify)

REST API server. Port: 3001

Key routes:
- `GET /health` - Health check
- `GET /themes`, `GET /themes/:id` - Themes
- `/auth/*` - Authentication (WebAuthn, JWT)
- `/chat/*` - Chat streaming and conversations
- `/extensions/*` - Extension management
- `/settings/*` - User and app settings

### apps/web (Vue + Vite)

Web frontend. Port: 3002 (dev). Uses HTTP-based ApiClient.

### apps/electron

Desktop app with main process (Node.js) and renderer (Vue).

```
apps/electron/
├── src/
│   ├── main/           # Node.js - window, IPC handlers
│   ├── preload/        # Context bridge
│   └── renderer/       # Vue app with IPC-based ApiClient
```

### apps/tui (Commander CLI)

Command-line interface using core + adapters-node directly.

---

## Development Workflow

### Commands

| Task | Command |
|------|---------|
| Start web dev | `pnpm dev:web` |
| Start electron dev | `pnpm dev:electron` |
| Run CLI | `pnpm dev:tui <command>` |
| Build packages | `pnpm build:packages` |
| Build everything | `pnpm build` |
| Run tests | `pnpm test` |
| Type check | `pnpm typecheck` |
| Lint | `pnpm lint` |

### Ports

| Port | Service |
|------|---------|
| 3001 | API server |
| 3002 | Web dev server |
| 3003 | Electron renderer dev server |

---

## i18n Usage

- `@stina/i18n` auto-detects language. Vue apps call `provideI18n(app)` once.
- `installUi(app)` registers `$t`, `$setLang`, `$getLang` globally.
- Prefer `$t('chat.input_placeholder')` in templates.

---

## Release Process

Uses Release-Please and Conventional Commits. Merge to `main` updates a release PR. Only `@stina/extension-api` is published to npm. Details in `docs/release-process.md`.

---

## Common Patterns

### Error Handling

```typescript
import { AppError, ErrorCode, Result, ok, err } from '@stina/core'

throw new AppError(ErrorCode.THEME_NOT_FOUND, 'Theme not found', { themeId })

function divide(a: number, b: number): Result<number> {
  if (b === 0) return err(new AppError(ErrorCode.VALIDATION_INVALID, 'Division by zero'))
  return ok(a / b)
}
```

### Logging

```typescript
import { createConsoleLogger, getLogLevelFromEnv } from '@stina/adapters-node'
const logger = createConsoleLogger(getLogLevelFromEnv())
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

```typescript
import { requireAuth, requireAdmin } from '@stina/auth'

// Require authenticated user
fastify.get('/protected', { preHandler: requireAuth }, async (request) => {
  const userId = request.user!.id
})

// Require admin
fastify.post('/admin-only', { preHandler: requireAdmin }, async (request) => { })
```

> **See**: [docs/patterns/authentication.md](docs/patterns/authentication.md) for Web vs Electron flows.

---

## Implementing New Features

### Adding a new core function

1. Add to `packages/core/src/myfeature/myFunction.ts` (pure TypeScript)
2. Export from `packages/core/src/index.ts`
3. Run `pnpm build:packages`

### Adding a new API endpoint

> **See**: [docs/guides/adding-api-endpoint.md](docs/guides/adding-api-endpoint.md)

1. Create route in `apps/api/src/routes/`
2. Register in `server.ts`
3. Add to `ApiClient` interface
4. Implement in HTTP client (web) and IPC client (electron)
5. Add IPC handler (electron main)

### Adding a new Vue component

> **See**: [docs/guides/adding-vue-component.md](docs/guides/adding-vue-component.md)

1. Create in `packages/ui-vue/src/components/`
2. Use `useApi()` for backend communication
3. Export from package index
4. Use in web and electron

### Adding a new built-in tool

> **See**: [docs/guides/adding-builtin-tool.md](docs/guides/adding-builtin-tool.md)

1. Create tool in `packages/builtin-tools/src/tools/`
2. Export from `tools/index.ts`
3. Add to `builtinToolFactories` array
4. Add i18n translations

### Adding a new theme

> **See**: [docs/guides/adding-theme.md](docs/guides/adding-theme.md)

Themes are extensions. Add to builtins or create extension manifest.

---

## File Naming Conventions

- TypeScript files: `camelCase.ts`
- Vue components: `PascalCase.vue`
- Test files: `*.test.ts` in `__tests__/` folders
- Config files: lowercase with dots (`tsup.config.ts`)

---

## Common Issues

### "Cannot find module" errors

- Run `pnpm build:packages`
- Check export in package's `index.ts`

### Electron shows white screen

- Verify Vite renderer on port 3003
- Check `RENDERER_PORT` env variable
- Verify preload script is built

### Type errors across packages

- Run `pnpm typecheck`
- Ensure package dependencies in package.json
- Check types exported from package index

---

## Documentation Index

When working on specific areas, read the detailed documentation:

| Working on... | Read |
|--------------|------|
| Architecture, diagrams | [docs/architecture.md](docs/architecture.md) |
| Chat system | [docs/packages/chat.md](docs/packages/chat.md) |
| Extensions | [docs/packages/extension-host.md](docs/packages/extension-host.md) |
| Extension API | [docs/packages/extension-api.md](docs/packages/extension-api.md) |
| Authentication | [docs/packages/auth.md](docs/packages/auth.md), [docs/patterns/authentication.md](docs/patterns/authentication.md) |
| Scheduler | [docs/packages/scheduler.md](docs/packages/scheduler.md) |
| Built-in tools | [docs/packages/builtin-tools.md](docs/packages/builtin-tools.md) |
| Extension installer | [docs/packages/extension-installer.md](docs/packages/extension-installer.md) |
| Session management | [docs/patterns/chat-session-manager.md](docs/patterns/chat-session-manager.md) |
| Extension UI | [docs/patterns/extension-ui-components.md](docs/patterns/extension-ui-components.md) |
| Signal flow, context | [docs/patterns/signal-flow.md](docs/patterns/signal-flow.md) |
| Adding API endpoints | [docs/guides/adding-api-endpoint.md](docs/guides/adding-api-endpoint.md) |
| Adding Vue components | [docs/guides/adding-vue-component.md](docs/guides/adding-vue-component.md) |
| Adding built-in tools | [docs/guides/adding-builtin-tool.md](docs/guides/adding-builtin-tool.md) |
| Adding themes | [docs/guides/adding-theme.md](docs/guides/adding-theme.md) |
