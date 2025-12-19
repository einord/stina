# AI Agent Instructions

This document provides context for AI agents working on the Stina codebase.

## Project Overview

**Stina** is an AI assistant chat application built as a TypeScript monorepo. The architecture supports multiple frontends (Web, Electron, CLI) sharing the same core business logic.

- **Version**: 0.5.0 (bootstrap)
- **Package Manager**: pnpm with workspaces
- **Node.js**: >=20 required

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Apps                                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │
│  │   API   │  │   TUI   │  │   Web   │  │    Electron     │ │
│  │(Fastify)│  │  (CLI)  │  │  (Vue)  │  │(Main + Renderer)│ │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────────┬────────┘ │
└───────┼────────────┼────────────┼────────────────┼──────────┘
        │            │            │                │
        ▼            ▼            │                │
┌───────────────────────────────┐ │          ┌─────┴─────┐
│    packages/adapters-node     │ │          │    IPC    │
│  (DB, Extensions, Settings)   │ │          └─────┬─────┘
└───────────────┬───────────────┘ │                │
                │                 │                ▼
                ▼                 │    ┌───────────────────┐
┌───────────────────────────────────┐  │ Electron Renderer │
│         packages/core             │  │      (Vue)        │
│  (Business Logic - NO Node/Vue)   │  └─────────┬─────────┘
└───────────────┬───────────────────┘            │
                │                                │
                ▼                                ▼
┌───────────────────────────────────────────────────────────┐
│                    packages/ui-vue                         │
│              (Shared Vue Components + ApiClient)           │
└───────────────────────────────────────────────────────────┘
```

### Critical Design Rules

1. **`packages/core` is platform-neutral** - NO imports from Node.js, Electron, Vue, HTTP libraries. Only pure TypeScript.
2. **`packages/ui-vue` is UI-neutral** - Components receive data via props/composables, never make direct API calls.
3. **Apps are thin wrappers** - They wire dependencies and call core, minimal business logic.
4. **ApiClient pattern** - Web uses HTTP, Electron uses IPC, but both implement the same interface.

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

### packages/ui-vue

Shared Vue components and the ApiClient abstraction.

```typescript
// Key exports
export { default as GreetingCard } from './components/GreetingCard.vue'
export { applyTheme } from './theme/applyTheme.js'
export { useApi, apiClientKey } from './composables/useApi.js'
export type { ApiClient } from './composables/useApi.js'
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

## App Structure

### apps/api (Fastify)

REST API server. Imports core + adapters-node.

- Port: 3001 (default)
- Routes: /health, /hello, /themes, /themes/:id, /extensions

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
# Web (starts API + Web with auto-rebuild of packages)
pnpm dev:web

# Electron (builds packages + main/preload, starts Vite renderer + Electron)
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

| Package       | Purpose              | Can import                |
| ------------- | -------------------- | ------------------------- |
| shared        | Types/DTOs           | Nothing                   |
| core          | Business logic       | shared                    |
| adapters-node | Node implementations | shared, core              |
| ui-vue        | Vue components       | shared, core (types only) |
| apps/\*       | Applications         | All packages              |
