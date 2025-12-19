# Architecture

This document describes the high-level architecture of the Stina application.

## Overview

Stina uses a monorepo structure with clear separation between platform-neutral code and platform-specific implementations.

```
┌─────────────────────────────────────────────────────────────┐
│                         Apps                                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │
│  │   API   │  │   TUI   │  │   Web   │  │    Electron     │ │
│  │(Fastify)│  │  (CLI)  │  │  (Vue)  │  │ (Main Process)  │ │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────────┬────────┘ │
└───────┼────────────┼────────────┼────────────────┼──────────┘
        │            │            │                │
        ▼            ▼            │                │
┌───────────────────────────────┐ │                │
│      packages/adapters-node   │ │                │
│  (DB, Extensions, Settings)   │ │                │
└───────────────┬───────────────┘ │                │
                │                 │                │
                ▼                 ▼                │
┌───────────────────────────────────────┐         │
│           packages/core               │         │
│  (Business Logic, Interfaces, Types)  │◄────────┘
└───────────────┬───────────────────────┘
                │
                ▼
┌───────────────────────────────────────┐
│           packages/shared             │
│         (Shared Types/DTOs)           │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│          packages/ui-vue              │
│    (Shared Vue Components/Theme)      │
└───────────────────────────────────────┘
        ▲                 ▲
        │                 │
   ┌────┴────┐      ┌────┴────┐
   │   Web   │      │Electron │
   │  (Vue)  │      │(Renderer)│
   └─────────┘      └─────────┘
```

## Package Responsibilities

### packages/shared

- Shared TypeScript types and interfaces
- DTOs (Data Transfer Objects) for API communication
- No dependencies on other packages

### packages/core

- Platform-neutral business logic
- No Node.js, browser, or framework-specific imports
- Defines interfaces for adapters (Logger, SettingsStore, etc.)
- Extension manifest and registry
- Theme tokens and registry
- Error types (AppError, Result)

### packages/adapters-node

- Node.js-specific implementations
- Database connection (better-sqlite3 + Drizzle)
- File-based extension loader
- Encrypted settings store
- Console logger implementation
- OS-specific path helpers

### packages/ui-vue

- Shared Vue components (used by Web and Electron)
- Theme application utilities
- No direct API calls (components receive data via props)

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
