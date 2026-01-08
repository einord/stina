# Developer Introduction

This document is for developers who want to contribute to Stina.

## Project overview

Stina is a TypeScript monorepo with a clear split between Node.js and browser code.

Apps:

- `apps/api` - Fastify API server
- `apps/web` - Vue web app (HTTP client)
- `apps/electron` - Electron app (main + renderer, IPC)
- `apps/tui` - CLI app

Packages:

- `packages/core` - Pure TypeScript business logic
- `packages/chat` - Chat orchestration (Node.js only)
- `packages/adapters-node` - Node.js implementations (DB, filesystem)
- `packages/ui-vue` - Shared Vue components
- `packages/shared` - Types and DTOs

For deeper details, see `docs/architecture.md`.

## Prerequisites

- Node.js 20+
- pnpm 8+

## Setup

```bash
pnpm install
```

If you hit missing package errors, build the shared packages:

```bash
pnpm build:packages
```

## Run the apps

```bash
# API only
pnpm dev:api

# Web UI (starts API + Web with watch)
pnpm dev:web

# Electron app (main + renderer)
pnpm dev:electron

# CLI examples
pnpm dev:tui hello --name World
pnpm dev:tui theme --list
```

Ports used in dev:

- API: http://localhost:3001
- Web: http://localhost:3002
- Electron renderer dev server: http://localhost:3003

## Debugging and configuration

- Environment variables and data paths: `docs/configuration.md`
- Database details: `docs/database.md`
- Extensions and themes: `docs/extensions.md`, `docs/themes.md`
- Chat package notes: `docs/chat-package.md`

## AI tooling

If you use AI in this repo, follow the instructions in `AGENTS.md`.
