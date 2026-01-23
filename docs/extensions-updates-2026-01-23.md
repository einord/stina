# Extension API Update: Request-Scoped ExecutionContext

**Date:** 2026-01-23
**Breaking Change:** Yes
**Affected:** All extensions using tools, actions, or scheduler callbacks

## Summary

The extension API has been updated to use **request-scoped context** instead of global mutable state. This eliminates race conditions and provides a cleaner architecture with explicit data flow.

### What Changed

1. `Tool.execute()` and `Action.execute()` now receive an `ExecutionContext` parameter
2. `SchedulerAPI.onFire()` callbacks now receive an `ExecutionContext` parameter
3. `userId` has been removed from `ExtensionContext` (activation context)

## Migration Guide

### Tools

**Before:**
```typescript
import { initializeExtension, ExtensionContext, Tool } from '@stina/extension-api/runtime'

export function activate(context: ExtensionContext) {
  const tool: Tool = {
    id: 'my-tool',
    name: 'My Tool',
    description: 'Does something useful',

    execute: async (params) => {
      // Reading userId from global context - RACE CONDITION RISK
      const userId = context.userId

      if (userId) {
        const data = await context.storage?.getForUser(userId, 'preferences')
      }

      return { success: true }
    }
  }

  context.tools?.register(tool)
}
```

**After:**
```typescript
import { initializeExtension, ExtensionContext, ExecutionContext, Tool } from '@stina/extension-api/runtime'

export function activate(context: ExtensionContext) {
  const tool: Tool = {
    id: 'my-tool',
    name: 'My Tool',
    description: 'Does something useful',

    // Now receives ExecutionContext as second parameter
    execute: async (params, execContext: ExecutionContext) => {
      // Reading userId from request-scoped context - SAFE
      const userId = execContext.userId

      if (userId) {
        const data = await context.storage?.getForUser(userId, 'preferences')
      }

      return { success: true }
    }
  }

  context.tools?.register(tool)
}
```

### Actions

**Before:**
```typescript
const action: Action = {
  id: 'my-action',

  execute: async (params) => {
    const userId = context.userId  // Global context
    return { success: true }
  }
}
```

**After:**
```typescript
const action: Action = {
  id: 'my-action',

  execute: async (params, execContext: ExecutionContext) => {
    const userId = execContext.userId  // Request-scoped
    return { success: true }
  }
}
```

### Scheduler Callbacks

**Before:**
```typescript
context.scheduler?.onFire((payload) => {
  // userId was set on global context before callback
  const userId = context.userId
  console.log(`Job ${payload.id} fired for user ${userId}`)
})
```

**After:**
```typescript
context.scheduler?.onFire((payload, execContext) => {
  // userId is now in the ExecutionContext parameter
  const userId = execContext.userId
  console.log(`Job ${payload.id} fired for user ${userId}`)
})
```

### Scheduling Jobs with User Context

If you want to schedule a job that should fire for a specific user, you must now explicitly set `userId` on the job:

**Before:**
```typescript
// userId was automatically included from global context
execute: async (params) => {
  await context.scheduler?.schedule({
    id: 'reminder',
    schedule: { type: 'at', at: reminderTime }
  })
}
```

**After:**
```typescript
execute: async (params, execContext) => {
  // Explicitly include userId if you want user-scoped job
  await context.scheduler?.schedule({
    id: 'reminder',
    schedule: { type: 'at', at: reminderTime },
    userId: execContext.userId  // Must be explicit now
  })
}
```

## ExecutionContext Interface

```typescript
interface ExecutionContext {
  /**
   * User ID for the current request.
   * Undefined for system/global operations.
   */
  readonly userId?: string

  /** Extension metadata */
  readonly extension: {
    readonly id: string
    readonly version: string
    readonly storagePath: string
  }
}
```

## Why This Change?

### Problem: Race Conditions

The previous implementation mutated a global `userId` field on `ExtensionContext`:

```typescript
// BEFORE: In runtime.ts
if (extensionContext && payload.userId) {
  extensionContext.userId = payload.userId  // Set before execute
}
const result = await tool.execute(payload.params)
extensionContext.userId = undefined  // Reset after execute
```

If two tool executions ran concurrently, one could read the wrong `userId`:

```
Request A: Set userId = "user-1"
Request B: Set userId = "user-2"
Request A: Read userId → Gets "user-2" (WRONG!)
Request B: Read userId → Gets "user-2" (correct)
```

### Solution: Request-Scoped Context

Each execution now receives its own immutable context object:

```typescript
// AFTER: In runtime.ts
const execContext: ExecutionContext = {
  userId: payload.userId,
  extension: { ... }
}
const result = await tool.execute(payload.params, execContext)
```

No global state is mutated, and each request has its own isolated context.

## Checklist for Extension Authors

- [ ] Update all `Tool.execute()` methods to accept `(params, context: ExecutionContext)`
- [ ] Update all `Action.execute()` methods to accept `(params, context: ExecutionContext)`
- [ ] Update all `scheduler.onFire()` callbacks to accept `(payload, context)`
- [ ] Replace `context.userId` reads with `execContext.userId` in execute methods
- [ ] Add explicit `userId` to `scheduler.schedule()` calls if user-scoping is needed
- [ ] Add explicit `userId` to `chat.appendInstruction()` calls if user-scoping is needed
- [ ] Run TypeScript compilation to catch any missed changes
