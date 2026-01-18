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

- [ ] **2.1.1** List all API endpoints that should be admin-only
- [ ] **2.1.2** Check if role-based middleware exists
- [ ] **2.1.3** Identify gaps in authorization

**Admin-only endpoints (expected):**
- [ ] `POST /extensions/install`
- [ ] `DELETE /extensions/:id`
- [ ] `POST /invitations`
- [ ] `DELETE /invitations/:id`
- [ ] `GET /admin/*` (if exists)
- [ ] Model config CRUD (create, update, delete - not read)

### 2.2 Implement Role-Based Access Control

- [ ] **2.2.1** Create/update auth middleware to check user role
- [ ] **2.2.2** Apply admin-only middleware to extension management routes
- [ ] **2.2.3** Apply admin-only middleware to invitation routes
- [ ] **2.2.4** Apply admin-only middleware to model config mutation routes
- [ ] **2.2.5** Return proper 403 Forbidden responses for unauthorized access
- [ ] **2.2.6** Add tests for role-based access control

### 2.3 UI Adjustments for Non-Admin Users

- [ ] **2.3.1** Hide/disable "Install Extension" button for non-admins
- [ ] **2.3.2** Hide/disable extension management UI for non-admins
- [ ] **2.3.3** Hide/disable model config edit/add/delete buttons for non-admins
- [ ] **2.3.4** Show appropriate messaging when features are admin-only

---

## Fas 3: Model Configs - Split Global/User (Priority: MEDIUM)

### 3.1 Schema Changes

- [ ] **3.1.1** Design new schema:
  - `model_configs` stays global (admin manages), remove `user_id` column
  - Add `default_model_config_id` to `user_settings`
- [ ] **3.1.2** Create migration to:
  - Remove `user_id` from `model_configs`
  - Add `default_model_config_id` (TEXT, nullable, FK to model_configs.id) to `user_settings`
- [ ] **3.1.3** Update `model_configs` schema in code
- [ ] **3.1.4** Update `user_settings` schema in code

### 3.2 Repository Updates

- [ ] **3.2.1** Update `ModelConfigRepository`:
  - Remove `userId` filtering
  - Make it return all configs (global)
- [ ] **3.2.2** Update `UserSettingsRepository`:
  - Add methods for getting/setting default model config
  - `getDefaultModelConfig()`
  - `setDefaultModelConfig(modelConfigId)`

### 3.3 API Updates

- [ ] **3.3.1** Update model config endpoints:
  - `GET /model-configs` - available to all (list)
  - `POST /model-configs` - admin only (create)
  - `PUT /model-configs/:id` - admin only (update)
  - `DELETE /model-configs/:id` - admin only (delete)
- [ ] **3.3.2** Add endpoint for user's default model:
  - `GET /user/default-model` - get current user's default
  - `PUT /user/default-model` - set current user's default
- [ ] **3.3.3** Update chat streaming to use user's default model

### 3.4 UI Updates

- [ ] **3.4.1** Update model selection UI to use new endpoints
- [ ] **3.4.2** Show all available models to user
- [ ] **3.4.3** Allow user to select their default model
- [ ] **3.4.4** Disable edit/add/delete for non-admins

---

## Fas 4: Scheduler Jobs - Optional user_id (Priority: LOW)

### 4.1 Schema Changes

- [ ] **4.1.1** Add `user_id` column (TEXT, nullable) to `scheduler_jobs`
- [ ] **4.1.2** Add index on `user_id`
- [ ] **4.1.3** Create migration

### 4.2 Code Updates

- [ ] **4.2.1** Update scheduler schema in code
- [ ] **4.2.2** Update job creation to accept optional `userId`
- [ ] **4.2.3** Pass `userId` context when executing jobs (for extension use)

### 4.3 Extension API Updates

- [ ] **4.3.1** Update `scheduleJob()` API to accept optional `userId`
- [ ] **4.3.2** Pass `userId` to extension when job executes (if set)
- [ ] **4.3.3** Document new parameter in extension API

---

## Fas 5: Extension API - userId Support (Priority: LOW)

### 5.1 Investigation

- [ ] **5.1.1** Review current ExtensionContext interface
- [ ] **5.1.2** Review how tools/actions are invoked
- [ ] **5.1.3** Identify all places where userId might be needed:
  - Tool execution
  - Action execution
  - Storage operations
  - Database operations
  - Scheduled job execution

### 5.2 API Design

- [ ] **5.2.1** Design how userId will be passed to extensions:
  - In ExtensionContext?
  - As parameter to tool/action handlers?
  - Both?
- [ ] **5.2.2** Document the design decision here:

**Design:**
```
(To be filled in after investigation)
```

### 5.3 Implementation

- [ ] **5.3.1** Update ExtensionContext to include optional `userId`
- [ ] **5.3.2** Update tool execution to pass `userId`
- [ ] **5.3.3** Update action execution to pass `userId`
- [ ] **5.3.4** Update storage API to support user-scoped storage:
  - `storage.get(key)` - extension-global
  - `storage.getUserScoped(userId, key)` - per-user
- [ ] **5.3.5** Update database API if needed
- [ ] **5.3.6** Update TypeScript types in `@stina/extension-api`
- [ ] **5.3.7** Document changes for extension developers

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
| 2 | Admin-Only Controls | Not Started | 0% |
| 3 | Model Configs Split | Not Started | 0% |
| 4 | Scheduler Jobs | Not Started | 0% |
| 5 | Extension API | Not Started | 0% |

**Overall Progress**: ~25%

---

*Last updated: 2026-01-18*
