# Adding a Built-in Tool

This guide walks through adding a new built-in tool to Stina. Built-in tools are always available without requiring an extension.

## Overview

Adding a built-in tool involves four steps:

1. Create the tool file in `packages/builtin-tools/src/tools/`
2. Export from `tools/index.ts`
3. Register in `packages/builtin-tools/src/index.ts`
4. Add i18n translations

## Step 1: Create the Tool File

Create a new file in `packages/builtin-tools/src/tools/`. For example, `myTool.ts`:

```typescript
import type { BuiltinToolFactory, ToolExecutionContext } from '../types.js'
import { createTranslator } from '@stina/i18n'

// Create translators for each supported language
const translators = {
  en: createTranslator('en'),
  sv: createTranslator('sv'),
}

/**
 * Factory function that creates the tool with access to context.
 */
export const createMyTool: BuiltinToolFactory = (_context) => ({
  // Unique tool ID (format: stina.builtin.<tool_name>)
  id: 'stina.builtin.my_tool',

  // Localized display name
  name: {
    en: translators.en.t('tools.builtin.my_tool.name'),
    sv: translators.sv.t('tools.builtin.my_tool.name'),
  },

  // Localized description for the AI
  description: {
    en: translators.en.t('tools.builtin.my_tool.description'),
    sv: translators.sv.t('tools.builtin.my_tool.description'),
  },

  // JSON Schema for parameters
  parameters: {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: 'The input value',
      },
    },
    required: ['input'],
    additionalProperties: false,
  },

  // Execute function - called when the AI invokes the tool
  execute: async (params: Record<string, unknown>, executionContext?: ToolExecutionContext) => {
    const input = params.input as string

    // Access user context if needed
    const timezone = executionContext?.timezone

    // Perform tool logic
    const result = `Processed: ${input}`

    return {
      success: true,
      data: { result, timezone },
    }
  },
})
```

### Key Types

- **BuiltinToolFactory**: Function that receives `BuiltinToolContext` and returns a `BuiltinTool`
- **ToolExecutionContext**: Runtime context with user-specific data (e.g., `timezone`)
- **ToolResult**: Return type with `success: boolean` and optional `data` or `error`

## Step 2: Export from tools/index.ts

Add the export to `packages/builtin-tools/src/tools/index.ts`:

```typescript
export { createDateTimeTool } from './dateTime.js'
export { createMyTool } from './myTool.js'
```

## Step 3: Register the Factory

Add the factory to `builtinToolFactories` in `packages/builtin-tools/src/index.ts`:

```typescript
import { createDateTimeTool, createMyTool } from './tools/index.js'

const builtinToolFactories: BuiltinToolFactory[] = [
  createDateTimeTool,
  createMyTool,
]
```

## Step 4: Add i18n Translations

Add translations in `packages/i18n/src/locales/en.ts` under `tools.builtin`:

```typescript
tools: {
  // ... existing keys
  builtin: {
    // ... existing tools
    my_tool: {
      name: 'My Tool',
      description: 'Description explaining when the AI should use this tool and what it does.',
    },
  },
},
```

Add the Swedish translation in `packages/i18n/src/locales/sv.ts`:

```typescript
tools: {
  builtin: {
    my_tool: {
      name: 'Mitt verktyg',
      description: 'Beskrivning som förklarar när AI:n ska använda verktyget.',
    },
  },
},
```

## Best Practices

- **Tool IDs**: Use format `stina.builtin.<snake_case_name>`
- **Descriptions**: Write clear descriptions that help the AI understand when to use the tool
- **Parameters**: Use JSON Schema with `additionalProperties: false` to prevent extra fields
- **Error handling**: Return `{ success: false, error: 'message' }` on failure
- **Context**: Prefer `executionContext` (passed to `execute()`) over `BuiltinToolContext` for user data
