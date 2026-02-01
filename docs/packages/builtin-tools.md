# Built-in Tools Package

The `@stina/builtin-tools` package provides core tools that are always available in Stina, regardless of which extensions are installed. These tools are registered before extensions load, ensuring essential functionality is always present.

## Package Overview

Built-in tools differ from extension tools in several important ways:

- **Always available**: Registered at app startup, before extension loading
- **No installation required**: Part of the core application
- **Shared extension ID**: All built-in tools use `stina.builtin` as their extension ID
- **Synchronous registration**: Registered directly with the ToolRegistry (no worker threads)

## Key Exports

```typescript
// Main registration function
export { registerBuiltinTools } from '@stina/builtin-tools'

// Individual tool factories (for testing or custom registration)
export { createDateTimeTool } from '@stina/builtin-tools'

// Types
export type { BuiltinTool, BuiltinToolContext, BuiltinToolFactory } from '@stina/builtin-tools'
export type { ToolExecutionContext } from '@stina/builtin-tools'

// Constants
export { BUILTIN_EXTENSION_ID } from '@stina/builtin-tools' // = 'stina.builtin'
```

## Built-in vs Extension Tools

| Aspect | Built-in Tools | Extension Tools |
|--------|---------------|----------------|
| Registration | Direct via `registerBuiltinTools()` | Via `ExtensionHost` worker messages |
| Lifecycle | Registered once at app startup | Loaded/unloaded with extensions |
| Execution | Inline function call | IPC to Worker Thread |
| Context | `ToolExecutionContext` | `ExecutionContext` (includes `extension` info) |
| Extension ID | Always `stina.builtin` | Extension's manifest ID |
| Isolation | Runs in main process | Sandboxed in worker thread |

## Type Definitions

### BuiltinTool Interface

```typescript
interface BuiltinTool {
  /** Tool ID (unique identifier) */
  id: string

  /** Display name - can be a simple string or localized strings */
  name: LocalizedString

  /** Description for the AI - should explain when and how to use the tool */
  description: LocalizedString

  /** Parameter schema (JSON Schema) */
  parameters?: Record<string, unknown>

  /**
   * Execute the tool with the given parameters
   * @param params Parameters for the tool
   * @param executionContext Optional context with user-specific runtime data
   * @returns Tool execution result
   */
  execute(
    params: Record<string, unknown>,
    executionContext?: ToolExecutionContext
  ): Promise<ToolResult>
}
```

### BuiltinToolFactory Type

Factory functions create tools with access to registration-time context:

```typescript
type BuiltinToolFactory = (context: BuiltinToolContext) => BuiltinTool
```

### ToolExecutionContext

Runtime context passed to tools during execution:

```typescript
interface ToolExecutionContext {
  /** User's configured timezone (e.g., "Europe/Stockholm") */
  timezone?: string

  /** User ID for user-scoped operations */
  userId?: string
}
```

This is the preferred way to access user-specific data. The context is populated at execution time, ensuring tools always receive current values.

## Adding a New Built-in Tool

Follow these steps to add a new built-in tool:

### Step 1: Create the Tool File

Create a new file in `packages/builtin-tools/src/tools/`:

```typescript
// packages/builtin-tools/src/tools/myTool.ts
import type { BuiltinToolFactory, ToolExecutionContext } from '../types.js'
import { createTranslator } from '@stina/i18n'

// Create translators for each supported language
const translators = {
  en: createTranslator('en'),
  sv: createTranslator('sv'),
}

export const createMyTool: BuiltinToolFactory = (_context) => ({
  id: 'stina.builtin.my_tool',
  name: {
    en: translators.en.t('tools.builtin.my_tool.name'),
    sv: translators.sv.t('tools.builtin.my_tool.name'),
  },
  description: {
    en: translators.en.t('tools.builtin.my_tool.description'),
    sv: translators.sv.t('tools.builtin.my_tool.description'),
  },
  parameters: {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: 'Input parameter description',
      },
    },
    required: ['input'],
    additionalProperties: false,
  },
  execute: async (params: Record<string, unknown>, executionContext?: ToolExecutionContext) => {
    const input = params.input as string
    const timezone = executionContext?.timezone

    // Tool implementation here

    return {
      success: true,
      data: {
        result: 'processed value',
      },
    }
  },
})
```

### Step 2: Export from tools/index.ts

```typescript
// packages/builtin-tools/src/tools/index.ts
export { createDateTimeTool } from './dateTime.js'
export { createMyTool } from './myTool.js'  // Add this line
```

### Step 3: Add to builtinToolFactories

Register the factory in the main index file:

```typescript
// packages/builtin-tools/src/index.ts
import { createDateTimeTool, createMyTool } from './tools/index.js'

const builtinToolFactories: BuiltinToolFactory[] = [
  createDateTimeTool,
  createMyTool,  // Add this line
]
```

### Step 4: Add i18n Translations

Add translations in both language files:

```typescript
// packages/i18n/src/locales/en.ts
tools: {
  // ...existing entries...
  builtin: {
    get_datetime: { /* ... */ },
    my_tool: {
      name: 'My Tool',
      description: 'Description explaining when and how the AI should use this tool.',
    },
  },
}

// packages/i18n/src/locales/sv.ts
tools: {
  // ...existing entries...
  builtin: {
    get_datetime: { /* ... */ },
    my_tool: {
      name: 'Mitt verktyg',
      description: 'Beskrivning som forklarar nar och hur AI:n ska anvanda verktyget.',
    },
  },
}
```

## Registration in Apps

Apps call `registerBuiltinTools()` during initialization, before loading extensions:

```typescript
// apps/api/src/setup.ts or apps/electron/src/main/index.ts
import { registerBuiltinTools } from '@stina/builtin-tools'
import { toolRegistry } from '@stina/chat'
import { getAppSettingsStore } from '@stina/chat/db'
import { APP_NAMESPACE } from '@stina/core'

// Register built-in tools with access to settings
const builtinToolCount = registerBuiltinTools(toolRegistry, {
  getTimezone: async () => {
    const settingsStore = getAppSettingsStore()
    return settingsStore?.get<string>(APP_NAMESPACE, 'timezone')
  },
})

console.log(`Registered ${builtinToolCount} built-in tools`)

// Then load extensions...
await extensionHost.loadExtensions()
```

The registration function returns the count of successfully registered tools.

## Example: DateTime Tool

The `get_datetime` tool provides the AI with accurate time information:

### Tool ID

`stina.builtin.get_datetime`

### Parameters

None required (empty object schema).

### Return Value

```typescript
{
  success: true,
  data: {
    // ISO 8601 timestamp with timezone offset
    iso: '2024-01-15T14:30:00.000+01:00',

    // Unix timestamp in milliseconds
    epoch_ms: 1705325400000,

    // IANA timezone identifier
    timezone: 'Europe/Stockholm',

    // Offset from UTC in minutes
    utc_offset_minutes: 60,

    // Human-readable UTC offset
    utc_offset: 'UTC+01:00',
  }
}
```

### Timezone Resolution

The tool determines timezone in this order:

1. `executionContext.timezone` (user's configured timezone)
2. System timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`)
3. Fallback to `'UTC'`

Invalid timezone strings automatically fall back to UTC.

## Execution Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            Tool Execution Request                             │
│                          (from AI or direct call)                             │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
                                       ▼
                          ┌────────────────────────┐
                          │    ToolRegistry        │
                          │    .executeTool()      │
                          └────────────┬───────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    │                                      │
                    ▼                                      ▼
      ┌─────────────────────────┐          ┌─────────────────────────┐
      │   extensionId ===       │          │   extensionId !==       │
      │   'stina.builtin'       │          │   'stina.builtin'       │
      └───────────┬─────────────┘          └───────────┬─────────────┘
                  │                                    │
                  ▼                                    ▼
      ┌─────────────────────────┐          ┌─────────────────────────┐
      │   Direct Function Call  │          │   ExtensionHost         │
      │   (inline execution)    │          │   .executeTool()        │
      │                         │          │   (IPC to worker)       │
      └───────────┬─────────────┘          └───────────┬─────────────┘
                  │                                    │
                  ▼                                    ▼
      ┌─────────────────────────┐          ┌─────────────────────────┐
      │   ToolResult            │          │   ToolResult            │
      │   (immediate return)    │          │   (async from worker)   │
      └─────────────────────────┘          └─────────────────────────┘
```

## Design Notes

### BuiltinToolContext is Deprecated

The `BuiltinToolContext` interface (passed at registration time) is deprecated. Prefer using `ToolExecutionContext` (passed at execution time) for accessing user-specific data:

```typescript
// Deprecated approach
const createTool: BuiltinToolFactory = (context) => ({
  execute: async (params) => {
    const tz = await context.getTimezone() // Async, cached at registration
  }
})

// Preferred approach
const createTool: BuiltinToolFactory = (_context) => ({
  execute: async (params, executionContext) => {
    const tz = executionContext?.timezone // Sync, current value at execution
  }
})
```

### Shared Extension ID

All built-in tools share the extension ID `stina.builtin`. This:

- Distinguishes them from extension-provided tools in the UI
- Ensures consistent attribution in tool call logs
- Prevents ID collisions with user-installed extensions

### Synchronous Registration

Unlike extension tools that register asynchronously through worker messages, built-in tools register synchronously. This guarantees they are available immediately after `registerBuiltinTools()` returns.

### Tool ID Convention

Built-in tool IDs follow the pattern: `stina.builtin.<tool_name>`

Examples:
- `stina.builtin.get_datetime`
- `stina.builtin.calculate` (hypothetical)
- `stina.builtin.search_web` (hypothetical)
