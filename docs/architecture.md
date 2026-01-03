# Architecture

This document describes the high-level architecture of the Stina application.

## Overview

Stina uses a monorepo structure with clear separation between:
- **Node.js packages** (`packages/*` except ui-vue) - Used by API, TUI, and Electron main process
- **Browser packages** (`packages/ui-vue`) - Shared Vue code for Web and Electron renderer
- **Apps** - Thin wrappers that wire everything together

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Browser Layer                              │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    packages/ui-vue                             │  │
│  │           (Shared Vue Components, Theme, ApiClient)            │  │
│  └───────────────────────┬───────────────────┬───────────────────┘  │
│                          │                   │                       │
│                          ▼                   ▼                       │
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

## Package Responsibilities

### packages/shared

- Shared TypeScript types and interfaces
- DTOs (Data Transfer Objects) for API communication
- No dependencies on other packages
- **Used by**: All packages and apps

### packages/core

- **Pure TypeScript only** - No Node.js, browser, or framework-specific imports
- Defines interfaces for adapters (Logger, SettingsStore, etc.)
- Extension manifest and registry
- Theme tokens and registry
- Error types (AppError, Result)
- **Used by**: Node.js packages and apps

### packages/chat

- Chat orchestration and business logic
- **Node.js environment** - Can use Node.js APIs (but not Vue/browser APIs)
- Database schema and repositories (Drizzle ORM)
- Provider registry and streaming
- **Used by**: API, TUI, Electron main

### packages/adapters-node

- **Node.js-specific implementations**
- Database connection (better-sqlite3 + Drizzle)
- File-based extension loader
- Encrypted settings store
- Console logger implementation
- OS-specific path helpers
- **Used by**: API, TUI, Electron main

### packages/ui-vue (Browser package)

- **Vue 3 components** for browser environments only
- Shared between Web app and Electron renderer
- Theme application utilities
- ApiClient interface and composables
- **Does NOT contain business logic** - receives data via props/API
- **Used by**: Web, Electron renderer

## Apps

### apps/api

- Fastify HTTP server
- REST endpoints for /hello, /themes, /extensions
- Wires together core and adapters-node
- Runs as a local server (no external backend)

### apps/tui

- Command-line interface using Commander
- Calls core functions directly (not via API)
- Output to stdout/stderr

### apps/web

- Vue 3 SPA built with Vite
- Communicates with API server via REST
- Uses ui-vue components
- Proxies API calls through Vite dev server

### apps/electron

- Electron main process
- Loads the web app in a BrowserWindow
- Can access Node.js APIs via preload script
- Shares UI code with web via ui-vue

## Design Principles

1. **Core is platform-neutral**: No Node/Electron/HTTP/Vue imports
2. **Apps are thin wrappers**: Wire dependencies and call core
3. **UI components are shared**: packages/ui-vue works in both Web and Electron
4. **Extensions are data-only by default**: Manifest + assets, no arbitrary code execution
5. **Small files, clear responsibility**: No mega-files
