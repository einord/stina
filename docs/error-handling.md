# Error Handling

Stina uses a consistent error handling approach across all apps.

## Error Types

### AppError

The main error class for application errors:

```typescript
import { AppError, ErrorCode } from '@stina/core'

throw new AppError(
  ErrorCode.THEME_NOT_FOUND,
  'Theme not found: my-theme',
  { themeId: 'my-theme' }, // context
  originalError // cause (optional)
)
```

### Error Codes

Error codes are categorized by domain:

```typescript
const ErrorCode = {
  // Validation
  VALIDATION_REQUIRED: 'VALIDATION_REQUIRED',
  VALIDATION_INVALID: 'VALIDATION_INVALID',

  // Database
  DB_CONNECTION_FAILED: 'DB_CONNECTION_FAILED',
  DB_QUERY_FAILED: 'DB_QUERY_FAILED',
  DB_MIGRATION_FAILED: 'DB_MIGRATION_FAILED',

  // Extensions
  EXTENSION_NOT_FOUND: 'EXTENSION_NOT_FOUND',
  EXTENSION_INVALID_MANIFEST: 'EXTENSION_INVALID_MANIFEST',
  EXTENSION_LOAD_FAILED: 'EXTENSION_LOAD_FAILED',

  // Configuration
  CONFIG_NOT_FOUND: 'CONFIG_NOT_FOUND',
  CONFIG_INVALID: 'CONFIG_INVALID',
  CONFIG_ENCRYPTION_FAILED: 'CONFIG_ENCRYPTION_FAILED',

  // Themes
  THEME_NOT_FOUND: 'THEME_NOT_FOUND',

  // General
  UNKNOWN: 'UNKNOWN',
}
```

### Result Type

For functions that can fail, use the Result type:

```typescript
import { Result, ok, err, AppError, ErrorCode } from '@stina/core'

function divide(a: number, b: number): Result<number> {
  if (b === 0) {
    return err(new AppError(ErrorCode.VALIDATION_INVALID, 'Cannot divide by zero'))
  }
  return ok(a / b)
}

// Usage
const result = divide(10, 2)
if (result.ok) {
  console.log(result.value) // 5
} else {
  console.error(result.error.message)
}
```

## Logging

### Logger Interface

Core defines a platform-neutral logger interface:

```typescript
interface Logger {
  debug(message: string, context?: Record<string, unknown>): void
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, context?: Record<string, unknown>): void
}
```

### Console Logger (Node.js)

```typescript
import { createConsoleLogger, getLogLevelFromEnv } from '@stina/adapters-node'

const logger = createConsoleLogger(getLogLevelFromEnv())

logger.info('Server started', { port: 3001 })
// [2024-01-15T10:00:00.000Z] [INFO] Server started {"port":3001}
```

### Log Levels

Set via `LOG_LEVEL` environment variable:

| Level   | Description                    |
| ------- | ------------------------------ |
| `debug` | Detailed debugging information |
| `info`  | General information (default)  |
| `warn`  | Warning messages               |
| `error` | Error messages only            |

## Error Handling by App

### API (Fastify)

Map AppError to HTTP responses:

```typescript
import { AppError, ErrorCode } from '@stina/core'

fastify.get('/themes/:id', async (request, reply) => {
  const theme = themeRegistry.getTheme(request.params.id)

  if (!theme) {
    const error = new AppError(ErrorCode.THEME_NOT_FOUND, `Theme not found`)
    reply.status(404)
    return {
      error: {
        code: error.code,
        message: error.message,
      },
    }
  }

  return theme.tokens
})
```

HTTP status code mapping:
| Error Code Pattern | HTTP Status |
|--------------------|-------------|
| `VALIDATION_*` | 400 |
| `*_NOT_FOUND` | 404 |
| `CONFIG_*`, `DB_*` | 500 |
| `UNKNOWN` | 500 |

### TUI (CLI)

Write errors to stderr with color:

```typescript
import { AppError } from '@stina/core'

try {
  // ... operation
} catch (error) {
  if (error instanceof AppError) {
    console.error(`\x1b[31mError [${error.code}]: ${error.message}\x1b[0m`)
  } else {
    console.error('\x1b[31mUnexpected error\x1b[0m')
  }
  process.exit(1)
}
```

### Web/Electron

Show user-friendly messages in UI:

```typescript
import { ref } from 'vue'

const error = ref<string | null>(null)

async function handleAction() {
  try {
    await someOperation()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'An error occurred'
    console.error('Operation failed:', e) // Log details
  }
}
```

## Best Practices

1. **Use AppError for expected errors**: Validation failures, not found, etc.
2. **Use Result for recoverable failures**: Functions that can legitimately fail
3. **Log unexpected errors**: Always log the full error with context
4. **Don't expose internal details**: User-facing messages should be friendly
5. **Include context**: Add relevant data to help debugging
6. **Chain causes**: Pass the original error as `cause` when wrapping
