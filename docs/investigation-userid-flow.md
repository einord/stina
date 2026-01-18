# Investigation Report: How userId Flows Through Stina System

**Date**: 2025-01-18
**Status**: Completed

## Executive Summary

The Stina system has a **critical flaw in userId handling**: While repositories are designed to accept `userId` in their constructors and implement proper filtering, **routes in the API layer are creating repositories WITHOUT userId parameters**. This means all user data gets mixed together and displayed to all users.

**Key Finding**: The API routes `chat.ts`, `chatStream.ts`, and `settings.ts` create repositories without passing `userId`, even though the auth plugin sets `request.user` correctly.

---

## 1. API Layer Investigation

### 1.1 JWT Extraction and Auth Plugin

**File**: `packages/auth/src/middleware/fastify/authPlugin.ts`

The auth plugin works correctly:
- Extracts JWT from `Authorization: Bearer <token>` header
- Verifies token with `authService.verifyAccessToken(token)`
- Sets `request.user` with the decoded user
- Handles local mode with `defaultUserId` option

**Status**: ✅ WORKING CORRECTLY

### 1.2 Route Implementation Issues

#### Problem 1: Chat Routes (chat.ts)

**File**: `apps/api/src/routes/chat.ts:17-19`

```typescript
export const chatRoutes: FastifyPluginAsync = async (fastify) => {
  const db = getDatabase()
  const repository = new ConversationRepository(db)  // ❌ NO userId!
```

**Issues**:
- ConversationRepository created WITHOUT userId parameter
- User information available in `request` object is ignored
- No `requireAuth` middleware (routes are public!)
- All conversations from all users are queried together

#### Problem 2: Chat Stream Routes (chatStream.ts)

**File**: `apps/api/src/routes/chatStream.ts:16-18`

```typescript
export const chatStreamRoutes: FastifyPluginAsync = async (fastify) => {
  const db = getDatabase()
  const repository = new ConversationRepository(db)  // ❌ NO userId!
  const modelConfigRepository = new ModelConfigRepository(db)  // ❌ NO userId!
```

**Issues**:
- Same problem as chat.ts
- No `requireAuth` middleware
- Streaming will mix conversations from all users

#### Problem 3: Settings Routes (settings.ts)

**File**: `apps/api/src/routes/settings.ts:12-15`

```typescript
export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  const db = getDatabase()
  const modelConfigRepo = new ModelConfigRepository(db)  // ❌ NO userId!
  const appSettingsRepo = new AppSettingsRepository(db)
  const quickCommandRepo = new QuickCommandRepository(db)  // ❌ NO userId!
```

**Issues**:
- ModelConfigRepository and QuickCommandRepository created without userId
- AppSettingsRepository has no userId concept at all (it's global!)
- No `requireAuth` middleware

### 1.3 Server Setup

**File**: `apps/api/src/server.ts:125-126`

```typescript
const conversationRepo = new ConversationRepository(db, options.defaultUserId)
const modelConfigRepository = new ModelConfigRepository(db, options.defaultUserId)
```

**Status**: ⚠️ PARTIALLY CORRECT
- Repositories ARE created with `defaultUserId` at setup time
- BUT these instances are never passed to the routes!

---

## 2. Repository Layer Analysis

### 2.1 ConversationRepository

**File**: `packages/chat/src/db/repository.ts:14-42`

```typescript
export class ConversationRepository implements IConversationRepository {
  constructor(
    private db: ChatDb,
    private userId?: string  // ✅ Designed for multi-user
  ) {}

  private getUserFilter() {
    if (this.userId === undefined) {
      return undefined  // Backward compatible - no filtering
    }
    return eq(conversations.userId, this.userId)  // ✅ Filters by user
  }

  async saveConversation(conversation: Conversation): Promise<void> {
    await this.db.insert(conversations).values({
      id: conversation.id,
      // ...
      userId: this.userId ?? null,  // ✅ Stores userId
    })
  }
```

**Analysis**:
- ✅ Repository IS designed correctly for multi-user support
- ✅ Has user filter logic
- ✅ Stores userId when provided
- ❌ **BUT**: When instantiated without userId, it returns ALL data (backward compatible mode)

### 2.2 ModelConfigRepository

**File**: `packages/chat/src/db/ModelConfigRepository.ts:38-53`

Same pattern as ConversationRepository - designed correctly but needs userId at instantiation.

### 2.3 QuickCommandRepository

**File**: `packages/chat/src/db/QuickCommandRepository.ts:33-47`

Same pattern - correctly designed, but needs userId at instantiation.

### 2.4 AppSettingsRepository

**File**: `packages/chat/src/db/AppSettingsRepository.ts:33-34`

```typescript
export class AppSettingsRepository {
  constructor(private db: ChatDb) {}  // ❌ NO userId support at all!
```

**Problem**:
- This repository has NO userId support
- App settings are stored globally in `key-value` format
- All users share the same settings!

---

## 3. Electron and TUI Implementation

### 3.1 Electron Main Process

**File**: `apps/electron/src/main/ipc.ts:100-118`

```typescript
const getConversationRepo = () => {
  conversationRepo ??= new ConversationRepository(ensureDb(), defaultUserId)
  return conversationRepo
}

const getModelConfigRepo = () => {
  modelConfigRepo ??= new ModelConfigRepository(ensureDb(), defaultUserId)
  return modelConfigRepo
}

const getQuickCommandRepo = () => {
  quickCommandRepo ??= new QuickCommandRepository(ensureDb(), defaultUserId)
  return quickCommandRepo
}
```

**Status**: ✅ CORRECT
- Electron properly passes `defaultUserId` to repositories
- Lazy initialization with caching
- All IPC handlers use these factory functions

### 3.2 TUI

**File**: `apps/tui/src/cli.ts`

The TUI appears to be a CLI tool without persistent user context. No multi-user implementation found.

---

## 4. ChatOrchestrator and Streaming

### 4.1 ChatOrchestrator

**File**: `packages/chat/src/orchestrator/ChatOrchestrator.ts:67-72`

```typescript
constructor(deps: ChatOrchestratorDeps, options: ChatOrchestratorOptions = {}) {
  this.deps = deps
  this.repository = deps.repository  // ✅ Takes repository as dependency
  // ...
}
```

**Status**: ✅ CORRECT
- Orchestrator accepts repository as dependency
- Doesn't create its own repository
- Works with whatever repository instance is passed

---

## 5. Critical Issues Found

### Issue #1: No Authentication on Chat Routes ❌

**Impact**: HIGH - Security vulnerability

Chat routes have NO `requireAuth` middleware:
- `/chat/conversations` - PUBLIC ❌
- `/chat/stream` - PUBLIC ❌
- `/settings/*` - PUBLIC ❌

### Issue #2: userId Not Passed to Repositories ❌

**Impact**: CRITICAL - Data isolation broken

Repositories are created per-route-registration (once), not per-request:

1. **chatRoutes.ts**: `new ConversationRepository(db)` - No userId
2. **chatStream.ts**: `new ConversationRepository(db)` - No userId
3. **settings.ts**: `new ModelConfigRepository(db)` - No userId

**The Fix Required**:
Routes need to create repository instances per-request with `request.user.id`:

```typescript
fastify.get(
  '/chat/conversations',
  { preHandler: requireAuth },
  async (request, reply) => {
    const userId = request.user!.id
    const repository = new ConversationRepository(db, userId)
    const conversations = await repository.listActiveConversations()
    return conversations.map(conversationToSummaryDTO)
  }
)
```

### Issue #3: AppSettings is Global, Not Per-User ❌

**Impact**: HIGH - Settings not isolated

The AppSettingsRepository has no concept of userId. All users share the same settings.

### Issue #4: Server-Level Repositories Are Created But Never Used ⚠️

**Impact**: MEDIUM - Confusing architecture

In `server.ts`, repositories are created with `defaultUserId` but never passed to routes.

---

## 6. Summary of Problems

| Component | Problem | Severity | Status |
|-----------|---------|----------|--------|
| Auth plugin | Working correctly | - | ✅ |
| Repositories | Correctly designed for multi-user | - | ✅ |
| Chat routes | No requireAuth, no userId passed | CRITICAL | ❌ |
| Stream routes | No requireAuth, no userId passed | CRITICAL | ❌ |
| Settings routes | No requireAuth, no userId passed | CRITICAL | ❌ |
| AppSettingsRepository | No userId support at all | HIGH | ❌ |
| Electron | Correctly implemented | - | ✅ |
| Web client | Correctly sends auth token | - | ✅ |

---

## 7. Required Fixes (Priority Order)

### Priority 1: CRITICAL - Add Authentication
- Add `requireAuth` middleware to all protected routes

### Priority 2: CRITICAL - Pass userId to Repositories
- Modify each route handler to create repositories with `request.user.id`
- Move repository instantiation from route registration to request handlers

### Priority 3: HIGH - Fix AppSettingsRepository
- Rename `app_settings` → `user_settings`
- Add `user_id` column to schema
- Add userId to `AppSettingsRepository` constructor
- Update all code paths

### Priority 4: MEDIUM - Database Cleanup
- Delete all data where `user_id IS NULL`
- Make `user_id` NOT NULL in all tables

---

## 8. Key Files to Modify

| File | Changes Needed |
|------|----------------|
| `apps/api/src/routes/chat.ts` | Add requireAuth, pass userId to repository |
| `apps/api/src/routes/chatStream.ts` | Add requireAuth, pass userId to repositories |
| `apps/api/src/routes/settings.ts` | Add requireAuth, pass userId to repositories |
| `packages/chat/src/db/AppSettingsRepository.ts` | Add userId support |
| `packages/chat/src/db/schema.ts` | Rename app_settings → user_settings |
| `packages/chat/src/db/migrations/` | New migration for cleanup + NOT NULL |
