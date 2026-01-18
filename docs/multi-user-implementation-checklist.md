# Multi-User Implementation Checklist

This document tracks the implementation of proper multi-user data separation in Stina.

**Created**: 2025-01-18
**Status**: In Progress

---

## Overview

Stina needs proper separation of user data. While `user_id` columns exist in several tables, they are not being used correctly - data is saved with `user_id = NULL` and displayed to all users.

### Decisions Made

- **Existing NULL data**: Will be deleted (app is new, minimal user impact)
- **user_id columns**: Will become NOT NULL after migration
- **TUI/Electron**: Will use a "system user" concept (requires investigation)

---

## Fas 1: Per-User Data (Priority: HIGH)

### 1.1 Investigation - How userId flows today

- [x] **1.1.1** Trace how `userId` is extracted from JWT in API routes
- [x] **1.1.2** Check if `userId` is passed to repositories (ConversationRepository, QuickCommandRepository, AppSettingsRepository)
- [x] **1.1.3** Identify all places where repositories are instantiated without `userId`
- [x] **1.1.4** Document findings in this section

**Findings:** See `docs/investigation-userid-flow.md` for full report.

**Summary of critical issues:**
1. ❌ **Auth plugin works** but routes don't use `requireAuth` middleware
2. ❌ **Repositories are designed correctly** but instantiated WITHOUT userId in routes
3. ❌ **AppSettingsRepository has NO userId support** at all
4. ✅ **Electron implementation is correct** - passes defaultUserId properly

**Files that need changes:**
- `apps/api/src/routes/chat.ts` - Add requireAuth, pass userId
- `apps/api/src/routes/chatStream.ts` - Add requireAuth, pass userId
- `apps/api/src/routes/settings.ts` - Add requireAuth, pass userId
- `packages/chat/src/db/AppSettingsRepository.ts` - Add userId support
- `packages/chat/src/db/schema.ts` - Rename app_settings → user_settings

### 1.2 Fix Conversations

- [x] **1.2.1** Ensure `ConversationRepository` receives `userId` in constructor
- [x] **1.2.2** Update API routes to pass `userId` when creating ConversationRepository
- [x] **1.2.3** Verify `createConversation()` sets `user_id` correctly
- [x] **1.2.4** Verify `getConversations()` filters by `user_id`
- [x] **1.2.5** Verify `getConversation()` checks `user_id` ownership
- [x] **1.2.6** Verify `archiveConversation()` checks `user_id` ownership
- [ ] **1.2.7** Add tests for user isolation in conversations

### 1.3 Fix Quick Commands

- [x] **1.3.1** Ensure `QuickCommandRepository` receives `userId` in constructor
- [x] **1.3.2** Update API routes to pass `userId` when creating QuickCommandRepository
- [x] **1.3.3** Verify CRUD operations use `user_id` correctly
- [ ] **1.3.4** Add tests for user isolation in quick commands

### 1.4 Rename app_settings → user_settings

- [x] **1.4.1** Create migration to rename table `app_settings` → `user_settings`
- [x] **1.4.2** Update schema file (`packages/chat/src/db/schema.ts`)
- [x] **1.4.3** Rename `AppSettingsRepository` → `UserSettingsRepository`
- [x] **1.4.4** Update all imports and references to the repository
- [x] **1.4.5** Update API routes (added requireAuth, per-user settings)
- [x] **1.4.6** Update DTOs if needed (`AppSettingsDTO` → `UserSettingsDTO`?) - Kept as AppSettingsDTO for now
- [x] **1.4.7** Verify settings are saved/loaded with correct `user_id`

### 1.5 Data Cleanup & Schema Hardening

- [x] **1.5.1** Create migration to DELETE all rows where `user_id IS NULL` in:
  - `chat_conversations`
  - `chat_interactions` (cascade from conversations)
  - `model_configs`
  - `user_settings` (formerly app_settings)
  - `quick_commands`
- [x] **1.5.2** Create migration to make `user_id` NOT NULL in all relevant tables
- [ ] **1.5.3** Run migrations and verify no errors
- [ ] **1.5.4** Test that app still works after migrations

### 1.6 TUI & Electron - System User

- [ ] **1.6.1** Investigate current auth flow in TUI
- [ ] **1.6.2** Investigate current auth flow in Electron main process
- [ ] **1.6.3** Design "system user" concept:
  - Should there be a special user created on first run?
  - Or should TUI/Electron require login?
  - How does this interact with the API?
- [ ] **1.6.4** Document decision here:

**Decision:**
```
(To be filled in after investigation)
```

- [ ] **1.6.5** Implement system user for TUI
- [ ] **1.6.6** Implement system user for Electron
- [ ] **1.6.7** Ensure `userId` is passed through IPC calls in Electron
- [ ] **1.6.8** Test TUI with new user isolation
- [ ] **1.6.9** Test Electron with new user isolation

---

## Fas 2: Admin-Only Controls (Priority: MEDIUM)

### 2.1 Investigation - Current Role Checks

- [x] **2.1.1** List all API endpoints that should be admin-only
- [x] **2.1.2** Check if role-based middleware exists
- [x] **2.1.3** Identify gaps in authorization

**Findings:**
- `requireAdmin` middleware already exists in `packages/auth/src/middleware/fastify/requireAuth.ts`
- Middleware returns 401 Unauthorized if not authenticated, 403 Forbidden if not admin
- Invitation routes in `auth.ts` already use `requireAdmin`
- Extension management routes and model config mutations needed `requireAdmin`

**Admin-only endpoints (implemented):**
- [x] `POST /extensions/install` - admin only
- [x] `DELETE /extensions/:id` - admin only
- [x] `POST /extensions/:id/enable` - admin only
- [x] `POST /extensions/:id/disable` - admin only
- [x] `POST /extensions/:id/update` - admin only
- [x] `PUT /extensions/:id/settings` - admin only
- [x] `POST /auth/users/invite` - admin only (already existed)
- [x] `GET /auth/invitations` - admin only (already existed)
- [x] `DELETE /auth/invitations/:id` - admin only (already existed)
- [x] `POST /settings/ai/models` - admin only
- [x] `PUT /settings/ai/models/:id` - admin only
- [x] `DELETE /settings/ai/models/:id` - admin only
- [x] `POST /settings/ai/models/:id/default` - admin only

**Read-only endpoints (requireAuth):**
- All GET extension endpoints require authentication but not admin role
- `GET /settings/ai/models` - any authenticated user can read model configs

### 2.2 Implement Role-Based Access Control

- [x] **2.2.1** Create/update auth middleware to check user role
  - `requireAdmin` middleware already existed in `@stina/auth`
  - Properly returns 401 for unauthenticated, 403 for non-admin users
- [x] **2.2.2** Apply admin-only middleware to extension management routes
  - Applied to: install, uninstall, enable, disable, update, settings update
- [x] **2.2.3** Apply admin-only middleware to invitation routes
  - Already existed in `auth.ts`
- [x] **2.2.4** Apply admin-only middleware to model config mutation routes
  - Applied to: create (POST), update (PUT), delete (DELETE), set default
- [x] **2.2.5** Return proper 403 Forbidden responses for unauthorized access
  - `requireAdmin` returns `{ error: { code: 'FORBIDDEN', message: 'Admin access required' } }`
- [ ] **2.2.6** Add tests for role-based access control

### 2.3 UI Adjustments for Non-Admin Users

*Note: These are frontend changes to be implemented separately.*

- [ ] **2.3.1** Hide/disable "Install Extension" button for non-admins
- [ ] **2.3.2** Hide/disable extension management UI for non-admins
- [ ] **2.3.3** Hide/disable model config edit/add/delete buttons for non-admins
- [ ] **2.3.4** Show appropriate messaging when features are admin-only

---

## Fas 3: Model Configs - Split Global/User (Priority: MEDIUM)

### 3.1 Schema Changes

- [x] **3.1.1** Design new schema:
  - `model_configs` stays global (admin manages), remove `user_id` and `is_default` columns
  - User's default model stored as key 'defaultModelConfigId' in `user_settings`
- [x] **3.1.2** Create migration `0007_model_configs_global.sql`:
  - Remove `user_id` from `model_configs` (table recreation for SQLite)
  - Remove `is_default` from `model_configs`
  - User's default model stored in `user_settings` as key-value
- [x] **3.1.3** Update `model_configs` schema in code - removed `userId` and `isDefault`
- [x] **3.1.4** Update `user_settings` schema - uses existing key-value pattern with 'defaultModelConfigId' key

### 3.2 Repository Updates

- [x] **3.2.1** Update `ModelConfigRepository`:
  - Removed `userId` from constructor (models are now global)
  - Removed all userId filtering
  - Removed `setDefault`/`getDefault` methods
- [x] **3.2.2** Update `UserSettingsRepository`:
  - Added `getDefaultModelConfigId(): Promise<string | null>`
  - Added `setDefaultModelConfigId(modelConfigId: string | null): Promise<void>`

### 3.3 API Updates

- [x] **3.3.1** Update model config endpoints:
  - `GET /settings/ai/models` - requireAuth (list all models globally)
  - `POST /settings/ai/models` - requireAdmin (create)
  - `PUT /settings/ai/models/:id` - requireAdmin (update)
  - `DELETE /settings/ai/models/:id` - requireAdmin (delete)
  - Removed `POST /settings/ai/models/:id/default` (moved to user endpoint)
- [x] **3.3.2** Add endpoints for user's default model:
  - `GET /settings/user/default-model` - requireAuth (get user's default)
  - `PUT /settings/user/default-model` - requireAuth (set user's default)
- [x] **3.3.3** Update chat streaming to use user's default model via UserSettingsRepository
- [x] **3.3.4** Update Electron IPC handlers:
  - Updated `model-configs-*` handlers (removed userId)
  - Added `user-default-model-get` and `user-default-model-set` handlers
- [x] **3.3.5** Update API clients (web and electron) with new endpoints
- [x] **3.3.6** Update shared types - removed `isDefault` from `ModelConfigDTO`

### 3.4 UI Updates

- [x] **3.4.1** Update model selection UI to use new endpoints (Ai.Models.vue)
- [x] **3.4.2** Show all available models to user (already worked)
- [x] **3.4.3** Allow user to select their default model (click to select)
- [x] **3.4.4** Remove isDefault toggle from model edit modal
- [ ] **3.4.5** Disable edit/add/delete for non-admins (requires admin role check in UI)

---

## Fas 4: Scheduler Jobs - Optional user_id (Priority: LOW)

### 4.1 Schema Changes

- [x] **4.1.1** Add `user_id` column (TEXT, nullable) to `scheduler_jobs`
- [x] **4.1.2** Add index on `user_id`
- [x] **4.1.3** Create migration (`packages/scheduler/src/migrations/0002_add_user_id.sql`)

### 4.2 Code Updates

- [x] **4.2.1** Update scheduler schema in code (`packages/scheduler/src/schema.ts`)
- [x] **4.2.2** Update job creation to accept optional `userId` (`SchedulerService.schedule()`)
- [x] **4.2.3** Pass `userId` context when executing jobs (via `SchedulerFirePayload.userId`)

### 4.3 Extension API Updates

- [x] **4.3.1** Update `scheduleJob()` API to accept optional `userId` (`SchedulerJobRequest.userId`)
- [x] **4.3.2** Pass `userId` to extension when job executes (`SchedulerFirePayload.userId`)
- [x] **4.3.3** Document new parameter in extension API (JSDoc in types.ts)

---

## Fas 5: Extension API - userId Support (Priority: LOW)

### 5.1 Investigation

- [x] **5.1.1** Review current ExtensionContext interface
- [x] **5.1.2** Review how tools/actions are invoked
- [x] **5.1.3** Identify all places where userId might be needed:
  - Tool execution
  - Action execution
  - Storage operations
  - Database operations
  - Scheduled job execution

### 5.2 API Design

- [x] **5.2.1** Design how userId will be passed to extensions:
  - In ExtensionContext?
  - As parameter to tool/action handlers?
  - Both?
- [x] **5.2.2** Document the design decision here:

**Design:**
```
userId is available in ExtensionContext and is set dynamically:
- During tool execution: set from the request payload
- During action execution: set from the request payload
- During scheduled job execution: set from SchedulerFirePayload.userId
- For extension activation: undefined (system context)

Storage API has both global and user-scoped methods:
- storage.get(key) / set / delete / keys - extension-global
- storage.getForUser(userId, key) / setForUser / deleteForUser / keysForUser - per-user

This design allows extensions to:
1. Check context.userId to know if in user context
2. Use user-scoped storage to store per-user data
3. Schedule user-scoped jobs that will have userId set when they fire
```

### 5.3 Implementation

- [x] **5.3.1** Update ExtensionContext to include optional `userId`
- [x] **5.3.2** Update tool execution to pass `userId`
- [x] **5.3.3** Update action execution to pass `userId`
- [x] **5.3.4** Update storage API to support user-scoped storage:
  - `storage.get(key)` - extension-global
  - `storage.getForUser(userId, key)` - per-user
- [x] **5.3.5** Update database API if needed (not needed, can use userId in SQL)
- [x] **5.3.6** Update TypeScript types in `@stina/extension-api`
- [x] **5.3.7** Document changes for extension developers (JSDoc in types.ts)

---

## Testing Checklist

### Manual Testing

- [ ] Create two test users (one admin, one regular)
- [ ] As admin: create conversations, quick commands, settings
- [ ] As regular user: verify admin's data is NOT visible
- [ ] As regular user: create own data, verify it's isolated
- [ ] As regular user: verify cannot access admin functions
- [ ] Test TUI with system user
- [ ] Test Electron with system user

### Automated Tests

- [ ] Unit tests for repository user isolation
- [ ] Integration tests for API user isolation
- [ ] Tests for admin-only endpoints returning 403

---

## Notes & Decisions Log

### 2025-01-18 - Initial Planning
- Decided to delete all NULL user_id data (app is new)
- Decided to make user_id NOT NULL after cleanup
- TUI/Electron will use "system user" concept (details TBD)
- Priority order: Per-user data → Admin controls → Model configs → Scheduler → Extension API

---

## Progress Tracking

| Fas | Description | Status | Completion |
|-----|-------------|--------|------------|
| 1 | Per-User Data | In Progress | 75% |
| 2 | Admin-Only Controls | Backend Done | 90% |
| 3 | Model Configs Split | Backend Done | 95% |
| 4 | Scheduler Jobs | Done | 100% |
| 5 | Extension API | Done | 100% |

**Overall Progress**: ~70%

*Note: Fas 2 and Fas 3 backend implementation is complete. Only UI adjustments remain:*
- *Fas 2.3: Hide admin-only UI for non-admins*
- *Fas 3.4.5: Disable edit/add/delete model buttons for non-admins*

*Fas 4 and Fas 5 are fully implemented:*
- *Scheduler jobs now support optional user_id*
- *Extensions can access userId in context during tool/action/job execution*
- *Storage API supports user-scoped storage methods*

---

*Last updated: 2026-01-18*
