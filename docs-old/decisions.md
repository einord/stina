# Technical Decisions

This document records the key technical decisions made in the Stina project.

## Monorepo Structure

**Decision**: Use pnpm workspaces for monorepo management.

**Alternatives considered**:

- npm workspaces: Less mature, slower
- yarn workspaces: Good, but pnpm is faster and has better disk usage
- Turborepo/Nx: Overkill for this project size

**Rationale**: pnpm provides excellent workspace support with fast installation and efficient disk usage through content-addressable storage.

## Build Tooling

**Decision**: Use tsup for building packages, tsx for development.

**Alternatives considered**:

- esbuild directly: Lower-level, more configuration needed
- Rollup: More complex configuration
- tsc only: Slow, no bundling

**Rationale**: tsup wraps esbuild with sensible defaults and DTS generation. tsx provides fast TypeScript execution for development.

## Database

**Decision**: SQLite with better-sqlite3 and Drizzle ORM.

**Alternatives considered**:

- PostgreSQL: Requires server, overkill for local-first app
- SQLite with sql.js: Slower, uses WASM
- LevelDB: Not relational, less familiar
- Prisma: Heavy, ORM approach different from our needs

**Rationale**: SQLite is perfect for local-first apps. better-sqlite3 is the fastest SQLite driver for Node.js. Drizzle provides type-safe SQL without hiding the database.

## API Framework

**Decision**: Fastify.

**Alternatives considered**:

- Express: Older, slower, less type-safe
- Hono: Great, but less ecosystem
- tRPC: Good for full-stack TS, but we need REST for flexibility

**Rationale**: Fastify is fast, has excellent TypeScript support, and a mature plugin ecosystem.

## UI Framework

**Decision**: Vue 3 with Composition API.

**Alternatives considered**:

- React: Good, but more boilerplate
- Svelte: Good, but smaller ecosystem
- Solid: Good, but less mature

**Rationale**: Vue 3's Composition API provides excellent DX with good TypeScript support. Vue's single-file components are clean and readable.

## Extension Model

**Decision**: Data-only extensions by default, with future sandboxed code execution.

**Alternatives considered**:

- Full code execution: Security risk
- WASM-only: Limited functionality
- No extensions: Less flexible

**Rationale**: Starting with data-only (manifests, themes, declarations) provides safety. Future code extensions can use WASM sandboxing or process isolation.

## Theme System

**Decision**: CSS custom properties (variables) from theme tokens.

**Alternatives considered**:

- CSS-in-JS: Runtime overhead, framework-specific
- Sass variables: Build-time only, can't change dynamically
- Tailwind themes: Tied to Tailwind

**Rationale**: CSS custom properties work everywhere, can be changed at runtime, and have zero runtime overhead.

## Configuration Storage

**Decision**: Encrypted JSON file for settings.

**Alternatives considered**:

- Plain JSON: No protection for sensitive data
- SQLite: More complex for simple key-value
- OS keychain: Platform-specific, complex

**Rationale**: Encrypted file provides protection for API keys and tokens while being portable and simple. OS keychain can be added later for the encryption key itself.

## Electron Architecture

**Decision**: Load web app in BrowserWindow, use preload for IPC.

**Alternatives considered**:

- Node integration: Security risk
- Separate Electron renderer: Code duplication

**Rationale**: Sharing the web app maximizes code reuse. Context isolation with preload provides security.

## Error Handling

**Decision**: Custom AppError class with error codes, Result type for recoverable failures.

**Alternatives considered**:

- Throw strings: No structure
- Error codes only: Less context
- Effect/fp-ts: Too complex for this project

**Rationale**: AppError provides structured errors with codes and context. Result type makes error handling explicit without heavy FP libraries.

## Testing

**Decision**: Vitest for all testing.

**Alternatives considered**:

- Jest: Slower, ESM support issues
- Mocha: More configuration needed
- Node test runner: Less mature

**Rationale**: Vitest is fast, has excellent ESM support, and works seamlessly with Vite-based projects.
