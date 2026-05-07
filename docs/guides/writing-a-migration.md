# Writing a Migration

This guide is about **per-package SQL migrations** — the day-to-day mechanism for evolving the database schema in a redesign-2026 package. A contributor writes a numbered `.sql` file under `packages/<pkg>/src/db/migrations/`, the runner in `@stina/adapters-node` picks it up at app boot, and the table or column change is applied once, on every machine that has not yet seen that file.

This is a different concern from `@stina/migration` — the one-time `§08` data migrator that converts legacy v0.5 chat-package conversations into the redesign-2026 schema on a user's existing install. If you need to understand that migrator instead, see [docs/redesign-2026/08-migration.md](../redesign-2026/08-migration.md). The rest of this guide is entirely about the per-package SQL runner.

## Where migrations live

Each redesign-2026 package owns a migrations folder:

```
packages/<pkg>/
└── src/
    └── db/
        └── migrations/
            ├── 0001_create_<pkg>_tables.sql
            └── 0002_add_some_column.sql
```

The packages that currently ship migrations are `@stina/threads`, `@stina/memory`, `@stina/autonomy`, and the legacy `@stina/chat`. The folder is not scanned directly by the apps — instead, each package exports a small helper that returns the resolved path at runtime:

```ts
// packages/threads/src/db/index.ts (canonical shape)
export function getThreadsMigrationsPath(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  return path.join(__dirname, 'migrations')
}
```

The helper is the single source of truth for the path. Each app imports `getThreadsMigrationsPath()` (or the equivalent for each package) and passes the results into `initDatabase`. You never hard-code a path in app code.

## Naming convention

Migration files follow a strict naming scheme:

```
NNNN_<short_description>.sql
```

- Four-digit zero-padded sequence: `0001`, `0002`, `0003`, …
- Snake_case description that captures the intent, not the syntax: `0002_add_first_turn_completed_at.sql` not `0002_alter_threads_table.sql`.
- Sequence is per-package. `threads/0002` and `memory/0002` are unrelated files.

**Once a migration is merged to a shared branch, or another developer has run it, the file must not be renamed or edited.** Before that point — while the file exists only on your local feature branch — edit it freely; no one else's database has seen it yet. The moment it is pushed to a shared branch or another developer pulls and boots the app, the file is frozen. The runner keys each migration as `<pkg>/<file>` in the `_migrations` dedup table, so a rename or post-merge edit produces silent drift: existing databases already have the old key recorded and skip the new content entirely, while fresh databases run the changed content. If you need to fix a mistake after a file has been shared, write a new migration that corrects it — do not edit the original.

## SQL conventions

The canonical example is `packages/threads/src/db/migrations/0002_add_first_turn_completed_at.sql`. It is short enough to read in full:

```sql
BEGIN;

ALTER TABLE threads ADD COLUMN first_turn_completed_at INTEGER;

-- Backfill: treat all existing threads as already-handled. New threads will
-- start NULL and the orchestrator/applyFailureFraming set this after the
-- first decision turn completes (success or failure).
--
-- Why last_activity_at and not created_at: for any thread with message
-- activity, last_activity_at >= created_at and represents "something
-- happened" which is the closest pre-redesign equivalent of "first turn
-- done". For empty threads the two values are equal. If a user-DB contains a
-- thread that was created and never had a turn run, backfill marks it as
-- visible — accepted, since pre-existing visibility was the bug we're
-- fixing forward.
UPDATE threads SET first_turn_completed_at = last_activity_at
  WHERE first_turn_completed_at IS NULL;

-- Partial index: SQLite can use this for both the "IS NOT NULL" filter and
-- the ORDER BY last_activity_at DESC in one go.
CREATE INDEX IF NOT EXISTS idx_threads_first_turn_done
  ON threads (last_activity_at DESC) WHERE first_turn_completed_at IS NOT NULL;

COMMIT;
```

Walk through the conventions this example demonstrates:

**`BEGIN; … COMMIT;` for atomicity.** SQLite's default mode is auto-commit per statement. Without an explicit transaction, an interrupted multi-statement migration leaves the schema half-applied — the `ALTER` may have run but the `UPDATE` may not. With `BEGIN; … COMMIT;`, a failure causes SQLite to roll back the entire block and a fix-forward retry replays cleanly from scratch. Wrap every migration that contains more than one statement.

**`IF NOT EXISTS` on `CREATE TABLE` and `CREATE INDEX`.** These clauses make the statements cheap-idempotent on their own — useful when debugging locally with a partially-applied migration. Note that SQLite has no `ALTER TABLE … ADD COLUMN IF NOT EXISTS` variant. ALTER migrations are not self-idempotent; they rely entirely on the runner's `_migrations` dedup (described in the next section). Do not try to write a self-idempotent ALTER.

**Backfill clauses.** When you add a column that the runtime expects to be set, include a backfill `UPDATE` that populates the column for existing rows using the same logic the runtime would use, never a non-deterministic default. This keeps all developers' databases in a consistent state after applying the migration. Use a `WHERE` clause that targets only the rows that need updating so the backfill is safe to read in code review and does not accidentally overwrite rows a later migration may have set.

**`CREATE INDEX IF NOT EXISTS` with a partial `WHERE` clause.** Filtered indexes keep index size proportional to the query they serve. A partial index on `WHERE first_turn_completed_at IS NOT NULL` only indexes the rows that are actually visible in the default thread list, which is the only query that uses that index. Include `IF NOT EXISTS` so the statement is idempotent.

**Comments explaining why, not what.** The SQL keywords already say what is happening. Comments that survive a schema review explain why a particular default was chosen, what edge case a backfill handles, or what query a new index serves. The `0002` example does this well.

## The runner

`runMigrations` from `@stina/adapters-node` is the canonical runner. Its behavior is important to understand:

**`_migrations` table.** On first call the runner creates `_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)` if it does not exist. It tracks every applied migration by name; a migration that already has an entry is skipped unconditionally.

**Composite dedup key.** The runner derives the package name from the path — `packages/threads/dist/db/migrations` → `threads`, `node_modules/@stina/threads/dist/db/migrations` → `threads` — and keys each migration as `<pkg>/<file>`. So `threads/0002_add_first_turn_completed_at.sql` is the dedup key for the example above. This is why renaming a package orphans its old entries (see Footguns).

**Cross-package ordering.** After collecting all migrations from all paths, the runner sorts them alphabetically by composite name before applying:

```
autonomy/0001_create_activity_log.sql
chat/0001_create_chat_tables.sql
chat/0002_add_model_config.sql
memory/0001_create_memory_tables.sql
threads/0001_create_threads.sql
threads/0002_add_first_turn_completed_at.sql
```

This ordering matters for DML migrations. If a package's `0002` migration inserts rows into another package's table, that other package's `CREATE TABLE` migration must have run first. Because the sort is alphabetical by composite name, `autonomy` migrations always run before `chat`, `memory`, and `threads` migrations. For most cross-package references — where alphabetical order matches the dependency direction — this is fine.

One common source of confusion: alphabetical order means `memory/0001` runs before `threads/0001`. `memory`'s `CREATE TABLE` declarations include `FOREIGN KEY (thread_id) REFERENCES threads(id)`. This is not a problem. **SQLite does not validate that the referenced table exists at `CREATE TABLE` time**, even with `PRAGMA foreign_keys = ON`. FK references are only validated at `INSERT` and `UPDATE`. The memory `CREATE TABLE` migration runs before the threads `CREATE TABLE` migration and succeeds because SQLite accepts the FK declaration without checking whether `threads` exists yet.

**`PRAGMA foreign_keys` is currently OFF.** SQLite defaults to not enforcing FK constraints. The runtime does not enable it. Existing `FOREIGN KEY` declarations in migration SQL are documentation, not runtime constraints today. Do not write a migration that depends on FK enforcement at `INSERT`.

**On failure.** Each migration is independently committed. If migration `0003` fails, `0001` and `0002` stay applied (their entries exist in `_migrations`) and a retry starts from `0003`. Whether `0003`'s partial effects survive depends on whether the SQL file wraps its statements in `BEGIN; … COMMIT;` — if yes, SQLite rolls back the partial transaction and the retry replays cleanly; if no, partial DDL may persist and the retry will hit a `duplicate column` or `table already exists` error. This is the strongest argument for the `BEGIN; … COMMIT;` convention. On failure the runner throws `AppError(DB_MIGRATION_FAILED, ..., { migration: '<pkg>/<file>' })` with the original SQLite error as `cause`.

## `tsup.config.ts splitting: false` — the load-bearing invariant

Every package that ships migrations must set `splitting: false` in its `tsup.config.ts`. This is the single most common cause of "my migration didn't run."

The migrations helper in `packages/<pkg>/src/db/index.ts` resolves its path using `import.meta.url`:

```ts
export function getThreadsMigrationsPath(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  return path.join(__dirname, 'migrations')
}
```

When `splitting: true` (the tsup default), the bundler hoists helper functions that appear in multiple entry points into a shared chunk at `dist/chunk-*.js`. `import.meta.url` in the hoisted code resolves to the chunk's own path, so `__dirname` becomes `dist/` rather than `dist/db/`. The helper then returns `dist/migrations`, but the actual migrations are at `dist/db/migrations`. The runner's `if (!fs.existsSync(migrationsPath)) continue` silently skips paths that do not exist — **app boots, no error, no log, no new tables.**

With `splitting: false`, the helper stays inside `dist/db/index.js` (or `index.cjs`), `__dirname` resolves to `dist/db`, and `path.join(__dirname, 'migrations')` is correct.

The canonical `tsup.config.ts` from `packages/threads/tsup.config.ts` (reproduce this block verbatim for any new package that ships migrations):

```ts
import { defineConfig } from 'tsup'
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export default defineConfig({
  entry: ['src/index.ts', 'src/db/index.ts'],
  format: ['esm', 'cjs'],
  dts: process.env.TSUP_DTS !== 'false',
  clean: true,
  sourcemap: true,
  shims: true,
  // Disable chunk-splitting so getThreadsMigrationsPath stays co-located with
  // the dist/db/migrations folder it references via import.meta.url.
  splitting: false,
  noExternal: ['nanoid'],
  onSuccess: async () => {
    // Copy migrations to dist (matches packages/chat convention)
    const srcMigrationsDir = join('src', 'db', 'migrations')
    const distMigrationsDir = join('dist', 'db', 'migrations')
    mkdirSync(distMigrationsDir, { recursive: true })

    const migrationFiles = readdirSync(srcMigrationsDir).filter((f) => f.endsWith('.sql'))
    for (const file of migrationFiles) {
      copyFileSync(join(srcMigrationsDir, file), join(distMigrationsDir, file))
    }
  },
})
```

The `onSuccess` block copies `.sql` files from `src/db/migrations/` to `dist/db/migrations/` at build time. Without this, the SQL files are simply not present in the build output — the runner would find a migrations folder that contains no `.sql` files.

## Adding a migration to an existing package

This is the common case. The package is already wired into the apps; you are only adding a new SQL file.

1. Pick the next sequence number. Look at what already exists in `packages/<pkg>/src/db/migrations/` and increment.

2. Write the SQL file following the conventions in the previous section. Wrap multi-statement migrations in `BEGIN; … COMMIT;`. Include `IF NOT EXISTS` on `CREATE TABLE` and `CREATE INDEX`. Write a backfill `UPDATE` if the new column has a NOT NULL constraint or if the runtime expects it to be populated on existing rows.

3. Build the package to copy the file into `dist/`:

   ```sh
   pnpm --filter @stina/<pkg> build
   ```

4. If the migration adds or removes a column, update the Drizzle schema in `packages/<pkg>/src/db/schema.ts` to match. **Schema drift between the SQL and Drizzle is the single biggest source of bugs** — the in-memory tests catch this immediately when assertions read back the new field.

5. Update the repository methods in `packages/<pkg>/src/db/repository.ts` if needed.

No app wiring changes are required. The package's migrations path is already registered in all three apps.

## Adding a new redesign-2026 package

This is rare. Follow the skeleton from an existing redesign-2026 package (`packages/threads/` or `packages/memory/`) and do the following for migrations specifically:

1. Create `packages/<pkg>/src/db/migrations/0001_create_<pkg>_tables.sql` with the initial `CREATE TABLE` statements.

2. Export `getXxxMigrationsPath()` from `packages/<pkg>/src/db/index.ts`, using the same shape as `getThreadsMigrationsPath()`.

3. Set `splitting: false` in `packages/<pkg>/tsup.config.ts` and copy the `onSuccess` migrations-copy block verbatim from `packages/threads/tsup.config.ts`.

4. Wire the path in all three apps:

   **`apps/api/src/server.ts`** — import the helper and add it to the `migrations` array:

   ```ts
   import { getXxxMigrationsPath } from '@stina/xxx/db'

   const db = initDatabase({
     logger,
     migrations: [
       getChatMigrationsPath(),
       getSchedulerMigrationsPath(),
       getAuthMigrationsPath(),
       getThreadsMigrationsPath(),
       getMemoryMigrationsPath(),
       getAutonomyMigrationsPath(),
       getXxxMigrationsPath(),   // add here
     ],
   })
   ```

   **`apps/tui/src/index.ts`** — identical pattern; the same `initDatabase` call exists there.

   **`apps/electron/src/main/index.ts`** — Electron cannot use the helper directly in production because the packaged app is inside an `.asar` bundle. Instead, it uses a local `getElectronMigrationsPath(pkg, subPath)` helper that resolves via `app.getAppPath()` in production and via the monorepo workspace root in dev:

   ```ts
   database = initDatabase({
     logger,
     migrations: [
       getElectronMigrationsPath('chat', 'db/migrations'),
       getElectronMigrationsPath('scheduler', 'migrations'),
       getElectronMigrationsPath('auth', 'db/migrations'),
       getElectronMigrationsPath('threads', 'db/migrations'),
       getElectronMigrationsPath('memory', 'db/migrations'),
       getElectronMigrationsPath('autonomy', 'db/migrations'),
       getElectronMigrationsPath('xxx', 'db/migrations'),   // add here
     ],
   })
   ```

   The second argument is the path inside the package's `dist/` directory where the migrations live — for new redesign-2026 packages following the threads/memory/autonomy pattern, that is `'db/migrations'`.

## Testing migrations

Tests use vitest with an in-memory `better-sqlite3` database. The key principle is that tests apply the package's own SQL migrations (not a hand-written test schema) so that schema drift between the SQL and the Drizzle definitions surfaces immediately.

**The per-package pattern** (from `packages/threads/src/__tests__/threadRepository.test.ts`):

```ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ThreadRepository, threadsSchema } from '../db/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function createTestDb() {
  const sqlite = new Database(':memory:')
  const migrationsDir = path.join(__dirname, '..', 'db', 'migrations')
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
    sqlite.exec(sql)
  }
  return drizzle(sqlite, { schema: threadsSchema })
}
```

This applies migrations in filename order, which matches how the runner processes files within a single package.

**FK gotcha.** SQLite does NOT validate `FOREIGN KEY ... REFERENCES <table>` at `CREATE TABLE` time — the referenced table can be missing and the migration still applies cleanly (this is the same permissiveness called out in the Runner section). The gotcha is at DML time: if your test inserts a row that the `threads` table is supposed to exist for, or relies on a foreign-key cascade, the test fails at the `INSERT` (or silently when FKs are off and your assertion expects cascade behavior). Two solutions:

Option 1: Stub the referenced table before applying your migrations (isolates the test from the `threads` package):

```ts
function createTestDb() {
  const sqlite = new Database(':memory:')
  // Stub the threads table so FK declarations in memory migrations are valid.
  sqlite.exec('CREATE TABLE threads (id TEXT PRIMARY KEY)')

  const migrationsDir = path.join(__dirname, '..', 'db', 'migrations')
  // … apply migrations as above …
}
```

This is the pattern in `packages/memory/src/__tests__/memoryRepositories.test.ts`. Use it when you are testing your package in isolation.

Option 2: Apply all packages' migrations together (cross-package integration tests):

```ts
function createTestDb(): Database.Database {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')

  const packages = ['threads', 'memory', 'autonomy']
  for (const pkg of packages) {
    const migrationsDir = path.join(__dirname, '..', '..', '..', pkg, 'src', 'db', 'migrations')
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
    for (const file of files) {
      sqlite.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf-8'))
    }
  }
  return sqlite
}
```

This is the pattern in `packages/test-fixtures/src/__tests__/seed.test.ts`. Use it for tests that write across package boundaries.

**Drizzle SYNC transactions.** Repository code inside tests must use `db.transaction(callback)` with a synchronous callback. Returning a `Promise` from the callback throws `"Transaction function cannot return a promise"`. Inside the callback use `.run()`, `.all()`, `.get()` synchronously. See `ThreadRepository.appendMessage` for the working pattern.

## Common footguns

**`splitting: false` missing in `tsup.config.ts`** — app boots, migrations runner silently skips paths that "don't exist" (because `import.meta.url` resolves to the wrong directory), new tables never appear. This is the single most common cause of a migration that appears to do nothing. Check this first.

**Renaming the package** — the dedup keys in `_migrations` are `<old-pkg>/<file>`. After the rename they become `<new-pkg>/<file>`, which look brand-new to the runner. On a fresh database the renamed migrations run from scratch and produce the expected schema. On any existing database that already has the old entries, the runner re-runs the SQL under the new key. `CREATE TABLE IF NOT EXISTS` migrations silently no-op (no error, but `_migrations` now has both old and new entries — clutter, not damage). `ALTER TABLE ADD COLUMN` migrations have no `IF NOT EXISTS` variant — they throw `duplicate column name` and the runner raises `DB_MIGRATION_FAILED` on the next boot. The failure is loud, but it is still a hard failure on existing installs. Do not rename packages that ship migrations.

**Editing a merged migration** — once another developer has run a migration, their `_migrations` table has the entry recorded. Any changes to the SQL file will never be seen on their database (the entry already exists). Fresh databases see the new content. The two schemas diverge permanently with no warning from the runner. Always write a new migration to correct a mistake on a shared file.

**Forgetting to update the Drizzle schema after a SQL change** — Drizzle queries don't fail with `no such column`. When a column exists in the database but not in the Drizzle schema, queries that go through Drizzle simply don't see it: reads return rows missing the field, writes don't populate it. **Raw SQL still works** — `db.prepare('INSERT INTO threads (..., new_col) VALUES (..., ?)').run(...)` populates the column, and `db.prepare('SELECT new_col FROM threads').all()` reads it back fine. The discrepancy is at Drizzle's typed query layer: `db.select().from(threads)` returns rows without `new_col`, and `db.insert(threads).values({ ..., newCol })` fails to compile (or silently drops the field if you cast around the type). The compile-time type error on Drizzle's typed API is your earliest signal; the runtime silent-miss only shows up if a test reads back a row and asserts on the new field. Run tests after every migration.

**Cross-package FK reference where alphabetical ordering works against you** — a DML migration (not a `CREATE TABLE`) in package A that inserts into package B's table will fail at runtime if A sorts before B and B's `CREATE TABLE` migration hasn't run yet. Alphabetical ordering: `autonomy < chat < memory < threads`. Dependencies mostly align, but check before writing cross-package INSERTs in migrations. Today `PRAGMA foreign_keys` is OFF, so FK violations at INSERT go undetected even if the FK declaration is present.

**Backfilling a NOT NULL column with a non-deterministic default** — if the backfill uses `random()` or `datetime('now')` without determinism, every developer's database ends up with different values. Use the same logic the runtime would use, or use a deterministic fixed value (zero, empty string, or the timestamp of the migration's own `applied_at` if the column is temporal and approximate values are acceptable).

**Confusing `@stina/migration` with `runMigrations`** — `@stina/migration` is the `§08` one-time data migrator: it runs once on a v0.5 install with legacy chat data and copies conversations into the redesign-2026 schema. `runMigrations` (from `@stina/adapters-node`) is the per-package SQL runner: it runs on every boot, applying any SQL files not yet recorded in `_migrations`. This guide is about the latter. See [docs/redesign-2026/08-migration.md](../redesign-2026/08-migration.md) for the former.

**Manual edits to `_migrations`** — editing the table directly to force a migration to re-run works in a dev environment but is never safe in production. For dev, prefer deleting the DB file and letting the runner reapply all migrations from scratch.

## Local testing workflow

**Fresh-DB reapply (the common case).** Delete the dev DB file and restart the app. The runner applies all migrations from scratch and you can verify the result:

```sh
DB_PATH=/tmp/stina-dev.db pnpm dev:seed typical-morning --fresh
sqlite3 /tmp/stina-dev.db ".tables"    # all expected tables present?
sqlite3 /tmp/stina-dev.db ".schema threads"   # new column present?
```

The `pnpm dev:seed typical-morning --fresh` command wipes the DB, runs all migrations, and inserts the `typical-morning` scenario — the quickest way to confirm a new migration applies cleanly and the seeder still works. The `--fresh` flag is what deletes the old file.

The API dev DB path defaults to whatever `DB_PATH` is set to. The Electron dev database lives under `~/Library/Application Support/Stina/` on macOS.

**Debugging a failure.** When the runner throws `DB_MIGRATION_FAILED`, the `AppError` carries `{ migration: '<pkg>/<file>' }` in its `context` field and the original SQLite error as `cause`. The migration name tells you exactly which file failed; the SQLite error tells you why. Both are present in the log output.

**CI considerations.** The vitest in-memory test pattern covers migrate-from-scratch: each test run starts from an empty database and applies all migrations in order. There is no migrate-up-from-old-snapshot test today — nothing exercises the scenario where a user database at schema version N gets migrated to version N+M. This is a known gap. If your migration is non-trivial — backfills a column that might have edge-case rows, or runs an `ALTER` on a large table — manually verify it against a real-data database before merging.

## Reference: the canonical worked example

`packages/threads/src/db/migrations/0002_add_first_turn_completed_at.sql` (~25 lines) is the most recently landed migration, hits all the conventions described in this guide, and is small enough to read top-to-bottom in one sitting. The Phase 8c commit message explains why each line is there — in particular why the backfill uses `last_activity_at` instead of `created_at`, and why a partial index is correct for the `IS NOT NULL` filter that the default thread list applies.
