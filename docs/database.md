# Database

Stina uses SQLite with Drizzle ORM for typed database access.

## Stack

- **Driver**: better-sqlite3 (synchronous SQLite bindings)
- **ORM**: Drizzle ORM (type-safe SQL builder)
- **Migrations**: SQL files applied in order

## Database Location

The database file is stored in the app's data directory:

- **macOS**: `~/Library/Application Support/Stina/data.db`
- **Linux**: `~/.local/share/Stina/data.db`
- **Windows**: `%APPDATA%/Stina/data.db`

Override with `DB_PATH` environment variable for development:

```bash
DB_PATH=./data/data.db pnpm dev:api
```

## Schema Definition

Core tables are defined using Drizzle DSL in `packages/adapters-node/src/db/schema.ts`:

```typescript
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const migrations = sqliteTable('_migrations', {
  name: text('name').primaryKey(),
  appliedAt: text('applied_at').notNull(),
})
```

## Migrations

### Core Migrations

Core schema migrations are stored in `packages/adapters-node/migrations/`:

```
migrations/
  0001_create_app_meta.sql
  0002_add_users.sql
```

### Extension Migrations

Extensions can provide their own migrations. Tables must be prefixed:

```
ext_<extensionId>_<tablename>
```

Example migration for extension `myname.todo`:

```sql
-- ext_myname.todo_0001_create_tasks.sql
CREATE TABLE ext_myname_todo_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
```

### Migration Tracking

The `_migrations` table tracks which migrations have been applied:

| name                                  | applied_at           |
| ------------------------------------- | -------------------- |
| 0001_create_app_meta.sql              | 2024-01-15T10:00:00Z |
| ext_myname.todo_0001_create_tasks.sql | 2024-01-15T10:01:00Z |

### Running Migrations

Migrations are run on app startup:

```typescript
import { getDb, getRawDb, runMigrations, initCoreSchema } from '@stina/adapters-node'

// Get database connection
const db = getDb(dbPath)
const rawDb = getRawDb()!

// Initialize core schema and run migrations
initCoreSchema(rawDb)
runMigrations(rawDb, migrationsPath)
```

## Why SQL Migrations?

Extensions cannot run arbitrary TypeScript for schema changes because:

1. **Security**: Arbitrary code execution is a risk
2. **Portability**: SQL migrations can be reviewed and audited
3. **Consistency**: Same migration format for core and extensions

## Usage Example

```typescript
import { getDb } from '@stina/adapters-node'
import { appMeta } from '@stina/adapters-node/schema'
import { eq } from 'drizzle-orm'

const db = getDb('/path/to/data.db')

// Insert
db.insert(appMeta)
  .values({
    key: 'version',
    value: '0.5.0',
    updatedAt: new Date().toISOString(),
  })
  .run()

// Select
const version = db.select().from(appMeta).where(eq(appMeta.key, 'version')).get()

// Update
db.update(appMeta)
  .set({ value: '0.6.0', updatedAt: new Date().toISOString() })
  .where(eq(appMeta.key, 'version'))
  .run()
```

## Best Practices

1. Use Drizzle DSL for table definitions (type safety)
2. Use SQL files for migrations (reviewable, portable)
3. Always include `updatedAt` for auditing
4. Prefix extension tables with `ext_<extensionId>_`
5. Keep migrations small and focused
6. Never modify existing migrations, create new ones
