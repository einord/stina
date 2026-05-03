# 08 — Migration

> Status: **Draft**. The path from current single-thread Stina to the redesign-2026 architecture, on the user's machine. Builds on every other section.

## Intent

The redesign breaks the current single-thread chat data model and introduces new packages, schemas, extension APIs, and runtime mechanisms. Migration must:

- **Preserve user-meaningful data.** Extension data (mail, people, work, etc.) is untouched. Chat history is split and archived per the legacy-thread rules below, never wiped.
- **Be safe.** Pre-migration backup is mandatory. Mid-migration crash leaves a defined, recoverable state. Post-migration sanity checks confirm a healthy upgrade.
- **Be one-way in v1.** Honest deferral: rollback to v0.x is not supported beyond restoring from the pre-migration backup. Users who don't want to upgrade should not upgrade.
- **Coexist with legacy callers during a deprecation window.** Existing extensions and scheduled jobs keep working; the legacy chat-message path is removed in a subsequent named release.
- **Make the new model legible to upgraders.** A returning user should not be confused on first launch after upgrade — see "Post-upgrade first launch" below.

## Design

### What gets migrated

| Data class | Action | Owner |
|------------|--------|-------|
| Existing single-thread chat history | Split into multiple `archived` Threads using an idle-gap heuristic; titles auto-generated from first user message in each. Searchable via `recall`. Never auto-deleted. | `packages/chat` migrator |
| Existing scheduler jobs that "send chat message" | Re-wired to call `emitEvent` (per §04). Pre-upgrade chat messages from these jobs already live in the resulting legacy threads; no separate activity-log migration. Legacy code path coexists during deprecation window. | `packages/scheduler` adapter |
| Existing extension data (mail, people, work, etc.) | Untouched. Schemas and storage stay as-is. | Extensions own their data |
| Existing app settings (provider, theme, etc.) | Translated where compatible; new redesign settings created with defaults. See "Settings translation" below. | App settings migrator |
| Existing tool manifests | Read; severity defaulted to `medium` if not declared (with one-time `dream_pass_flag` in next recap suggesting the user review). Redactor optional from day one. | Extension API loader |
| Existing user-set memories (none in v0.x — all chat history is implicit) | N/A | — |

### Pre-migration backup (mandatory)

Before any migration step runs, the runtime writes a single backup file to a per-platform backup directory (see "File system layout" below). Filename: `pre-redesign-2026-from-v0.<minor>.<patch>-<timestamp>.stina-backup`. Including the source version makes it obvious which v0.x release a backup pairs with — important because the rollback path requires reinstalling that version.

The backup contains:

- Full SQLite database snapshot (all tables, current schema)
- App settings export (JSON)
- Installed-extensions manifest snapshot (which extensions, which versions, paths)
- **Each extension's own data directory** (gzipped). Without this, "restore from backup" is incomplete — extensions own their data, but a usable rollback substrate must include it. Extensions whose data directories are unreadable are noted in the backup manifest with a per-extension error.
- Schema-version stamps per package

The backup is a self-contained, gzip-compressed archive. Restoring it returns the user to the exact pre-migration state.

**Backup retention.** Backups accumulate across major upgrades. Policy:

- The **redesign-2026 backup** (this one) is kept until the user removes it from `Inställningar → Backup`.
- **Subsequent major-migration backups** (v2 etc.) follow the same kept-until-removed rule.
- **Minor-migration backups** (v1.x → v1.y) are auto-rotated: keep last 3, purge older.
- Inställningar → Backup surfaces every backup with size + age + source-version-stamp; one-click delete-with-confirmation.

If backup creation fails (disk full, permissions denied, extension data dir unreadable), migration aborts with a clear error and no changes are made.

**Encryption** is deferred to v1.x. v1 ships unencrypted with documentation explicitly noting that the backup contains the full database and extension data, including any sensitive content (OAuth tokens, mail content, profile facts), and recommending the user keep backups in a secure location and remove them when no longer needed. The `.stina-backup` file format reserves room for an encryption header so v1.x can add encryption non-breakingly.

### Pre-migration quiescence

The migration must not run on top of in-flight work. Before the runner starts:

1. **Block new entries.** The app refuses to accept new user input, new extension events, or new scheduled-job firings.
2. **Drain in-flight items.** Wait for: any open Stina decision turn to complete, any executing scheduled job to finish, any open extension event handler to return.
3. **Grace timeout.** 60 seconds. If items haven't drained by then, the runner persists per-item "in-flight at upgrade" markers and proceeds. These markers surface in the post-upgrade welcome thread as a list of items the user may want to revisit.
4. **Auto-updater coordination.** On Electron, the auto-updater must not apply an update while a Stina turn is in flight. If one is running, the restart defers until the turn completes (or 60 s elapses, whichever first), with a visible banner explaining the wait.
5. **Web/API clients.** The API server on startup detects schema-version mismatch with running clients and returns `503 + { code: 'upgrade_required' }` from event-emitting endpoints until clients reconnect against the new schema. This is documented in the API contract.

### Migration script architecture

The migration is orchestrated by a single runner that calls per-package migrators in topological order. **The entire run executes inside one SQLite transaction** (`BEGIN IMMEDIATE` … `COMMIT` only after sanity checks). SQLite supports DDL inside transactions; better-sqlite3 makes it ergonomic. Per-package migrators are subroutines of the same transaction (no nested `BEGIN`).

Each new package ships its own migrations under `packages/<name>/src/migrations/` (matching the existing pattern at `packages/chat/src/db/migrations/` and `packages/scheduler/src/migrations/`).

Order, with dependency reasoning:

1. **`core`** — pure types only, no schema migrations.
2. **`threads`** — creates `Thread`, `Message` tables. Depends on nothing else.
3. **`memory`** — creates `StandingInstruction`, `ProfileFact`, `ThreadSummary` tables. Depends on `threads` (FK to `Thread.id` on `source_thread_id`).
4. **`autonomy`** — creates `AutoPolicy`, `ActivityLogEntry` tables. Depends on `threads` + `memory` (FKs to `Thread.id`, `StandingInstruction.id`).
5. **`chat`** — runs the legacy-thread split (see below), inserts the resulting Threads + Messages. Depends on `threads`.
6. **`scheduler` adapter** — re-wires the existing scheduler's job-fired path to call `emitEvent` instead of writing chat messages. Pre-upgrade job results stay in the resulting legacy threads. Depends on `threads` + `autonomy`.

If anything throws, the whole transaction rolls back atomically. The runner stops; the in-progress marker (see "Crash recovery") points to the failure point; the user is offered backup restore on next launch.

### Legacy-thread split

Collapsing all of v0.x's chat history into a single archived thread would violate principle 1 ("inbox over stream") for upgraders — their entire historical Stina experience would be the model the redesign rejects. It would also give `recall` and search a worst-case shape (one thread of tens of thousands of messages).

**v1 splits the legacy chat history at migration time using an idle-gap heuristic.**

- Iterate the v0.x messages in chronological order.
- Whenever the gap to the next message is ≥ 24 hours (configurable), close the current thread and start a new one.
- Each resulting thread:
  - `status: 'archived'`
  - `trigger: { kind: 'user' }`
  - `created_at` = first message's timestamp
  - `last_activity_at` = last message's timestamp
  - `title` auto-generated from the first user message (truncated to ~60 chars; falls back to *"Conversation from <date>"* if no user message)
  - Appears under the Archived segment in the trådlista

The heuristic is cheap, deterministic, has no LLM dependency, and produces topical coherence reasonably often (gaps tend to coincide with topic shifts). Better methods (semantic clustering, dream-pass post-processing) are open follow-ups but explicitly out of v1.

The split is logged to `settings_migration` details so a user curious about *why* their history landed in N threads can see the heuristic's output.

### Crash recovery

The migration runner writes a marker file (`migration-in-progress`, in the per-platform app data directory) **with structured progress** before the first migrator runs:

```json
{
  "started_at": 1730000000,
  "phase": "package:autonomy",
  "last_completed_package": "memory",
  "backup_path": "/path/to/pre-redesign-2026-from-v0.42.0-1730000000.stina-backup",
  "source_version": "v0.42.0",
  "target_version": "v1.0.0"
}
```

The marker is updated as each package completes. It is removed only after **all** sanity checks pass.

**On next launch, marker presence gates startup.** The app does not initialize any subsystem (no event handlers, no scheduler ticks, no extension loads) until the user has explicitly chosen what to do. The user is shown a clear three-option dialog:

- **Resume migration** — re-run the runner. Because the whole run is one SQLite transaction, the partial work was rolled back by SQLite at process death, so a resume is effectively a restart from scratch against the same v0.x state. Marker is preserved across attempts.
- **Restore from backup** — runs `stina restore <backup-path>` against the recorded backup. Restores the v0.x state exactly; the user can choose to retry the upgrade later or stay on v0.x.
- **Quit and contact support** — exits without changes; marker preserved; the user can come back to the dialog.

Auto-restore is forbidden — never silently overwrite without an explicit user choice. The dialog text shows what would be lost ("Migration was interrupted at step 4 of 6. Resuming will retry the upgrade against your v0.42.0 data; restoring will return you to v0.42.0 as it was on <backup date>.").

### Sanity checks (post-migration)

After all migrators succeed, the runner runs a checklist *before* committing the SQLite transaction. All checks must pass.

**Existence and shape:**

- Schema version stamps match expected per package
- Legacy thread(s) exist with `status: 'archived'`, `trigger.kind: 'user'`, valid auto-generated titles
- Settings table contains the expected new keys with defaults
- ActivityLogEntry tables are queryable

**Integrity:**

- **Row-count parity**: every chat message in the v0.x schema has exactly one corresponding row in the new threads/messages tables. Pre-migration count and post-migration count must match (per source row).
- **FK integrity**: every `Message.thread_id` resolves; every `AutoPolicy.scope.standing_instruction_id` (when set) resolves; every cross-table reference is consistent.
- **Index presence**: required indexes (per §02 implementation checklist) are present and are usable for representative queries.

**Performance:**

- **Search-index population** for the legacy threads has completed and a representative keyword query returns within a target latency (e.g. 200 ms on a typical machine; threshold tunable per release). This bounds the §03/§07 `recall` performance against worst-case pre-existing users.

**Backup integrity:**

- The backup file the runner just wrote can be re-opened and the SQLite database inside passes `PRAGMA integrity_check`.

**Extension data:**

- A checksum of every extension's data directory taken before migration matches the post-migration checksum (extension data must be untouched).

**Dry-run residue:**

- No artifacts from any prior `--dry-run` run persisted.

**Sanity-check failure aborts the runner.** The SQLite transaction rolls back; the in-progress marker stays; the user is offered backup restore on next launch.

### Dry-run scope

The runner can be invoked with `--dry-run`. Scope:

**Validates:**

- Pre-migration disk space available for backup
- Backup target writable
- Per-package migrator parses inputs (each package is asked "given this v0.x state, what would you do?" without writing)
- Row-count forecast matches pre-migration counts
- Sanity-check list would pass against the forecast post-state
- Extension audit shape (which extensions are green/amber/red against the v1 contract)

**Does not validate:**

- Data quality of transformations (the actual converted shape — that requires a real run against test fixtures, not against the user's data)
- Data inside any LLM-judged step (none in v1's migration; future migrations may have them)

**Side effects:**

- Writes a single `dry-run-report-<timestamp>.json` to the per-platform dry-runs directory (`<backup-dir>/dry-runs/`)
- No writes to the database, settings, or extension data directories
- Idempotent: running `--dry-run` twice produces identical reports (modulo timestamp)
- Does **not** create the pre-migration backup (would defeat the dry-run point); the report instead validates *that backup creation will succeed*
- Does **not** write `dry_run_completed` to the activity log (the new schema doesn't yet exist — and even after upgrade, dry-run is a developer tool)

### Extension API compatibility matrix

| API surface | Status | Notes |
|-------------|--------|-------|
| `emitEvent(input)` | **New, opt-in** | Extensions without it continue to function; only event-triggering extensions (mail, calendar, scheduled) need it. |
| `runtime.emitEventInternal(input)` | **New, runtime-only** | Not exposed to extensions; reserved for runtime callers (dream pass, recap spawn). |
| `registerRecallProvider(handler)` | **New, opt-in** | Without it, `recall` only queries Stina's own memory layer. |
| `ExtensionThreadHints` (in manifest) | **New, optional** | Extensions without hints get default card rendering. Validated at install per §05. |
| Tool manifest `severity` | **New, required for new tools** | Existing tools without `severity` default to `medium` at load time, with a one-time `dream_pass_flag` in the next recap suggesting review. |
| Tool manifest `redactor` | **New, optional** | Tools without one get `[redacted: no redactor declared]` and entry-flag at audit time per §06. |
| Tool manifest `engines.stina` | **New, optional** | Min-Stina-version constraint. Surfaced at install/upgrade time; warning if unsatisfied. |
| Tool manifest `api_version` | **New, recommended** | Declares which version of the extension API contract the extension targets. The audit (CLI and runtime) uses this to choose which deprecation rules apply. |
| Existing tool registration (`registerTool`) | **Preserved unchanged** | Same signature, same lifecycle. |
| Existing configuration views | **Preserved unchanged** | Re-used by §06 install dialog as the post-install welcome. |
| Existing OAuth / authentication flows | **Preserved unchanged** | |
| "Send to chat" pattern (extensions writing into the single thread) | **Deprecated, coexists during window** | Extensions calling the legacy method get a runtime warning; the call still works. Removed in a subsequent named release (see "Deprecation window"). |
| Right-panel widget registration | **Grandfathered, frozen for new entrants** | See "Widget grandfathering" below. |

#### Deprecation window

The legacy "send to chat" code path is removed in a **specific subsequent release**, not "60 days after the user upgrades" (which would be unpredictable for extension authors targeting the deprecation date). The release that removes the legacy path will be announced at v1 ship time with a fixed calendar date — typically v1.1, dated ~60 days after v1.0.

This gives extension authors a single deadline to target. Users who upgrade late still get the warning during the window, just less of it.

#### Widget grandfathering

§05 freezes new right-panel widget registrations in v1; existing widget code is preserved. Migration enforces this precisely:

- **Existing v0.x extension manifests with `contributes.widget`** declared → grandfathered. The widget registration call is allowed and idempotent (re-registration on every load works as it does today).
- **New manifests** (post-upgrade installations of never-before-seen extension IDs) declaring `contributes.widget` → install dialog warns "widgets are frozen in v1; this widget will not appear" and the install proceeds with the widget feature disabled.
- **Existing extensions that ship updates** continue to work because the extension ID is the same — they're still grandfathered.

Audit categorizes widget-shipping extensions as **amber** ("widget will continue to work, no future widget-API updates accepted in v1; documented contract lands in v1.x") rather than green.

### Extension developer experience

Extension authors need an actionable signal *before* a user upgrades, not after:

- **`stina-extension audit ./my-extension`** CLI inspects an extension bundle against the v1 API contract. Output: green/amber/red signal plus specific line-level warnings (*"calls deprecated `sendChatMessage` at src/handler.ts:42 — replace with `emitEvent`"*). Ships as part of `@stina/extension-api` so authors hit it in CI.
- **`manifest.api_version`** declares which version of the contract the extension targets. The audit uses this to choose deprecation rules. Missing field → audit assumes pre-v1 and applies the broadest set of warnings.
- **The user-facing audit at upgrade time uses the same checks** — one source of truth. The user-facing report's "broken" rows include a "report this to the extension's developer" link with the specific finding pre-filled.

### Extension audit at upgrade time

The runner enumerates installed extensions and categorizes each:

| Level | Default behavior post-upgrade | Meaning |
|-------|------------------------------|---------|
| **Green** | Enabled | Fully compatible — no action needed. |
| **Amber** | Enabled, with a one-line guidance note | Works but uses deprecated APIs (or ships a frozen widget). The card includes any guidance the registry has ("Update expected by [date]" if known). |
| **Red** | **Disabled** | Broken against v1. Data preserved in extension's directory; the welcome thread's audit card includes a "View data anyway" affordance that opens the extension's data path in the OS file manager so the user can rescue contacts/etc. before a fix lands. |

**Cascading effects of red extensions during upgrade:**

When the audit marks an extension as red, the migrator:

1. **Cascade-revokes any bound `AutoPolicy` rows** for that extension's tools (writes `memory_change` entries with `details.cascaded_from: { kind: 'extension_uninstall', extension_id }` per §06).
2. **Flags any `StandingInstruction`** referencing the extension's tools for user review in the next dream pass (per §07).
3. **Surfaces this in the welcome thread**: *"Extension X is incompatible with v1; 3 policies have been revoked and 2 standing instructions are flagged for your review."*

This applies the §06 cascading-uninstall semantics at upgrade time — same mechanism, same audit trail, same recovery path.

### Settings translation

| Existing setting | Migrated to | Notes |
|------------------|-------------|-------|
| Provider configuration (Ollama/OpenAI/etc.) | `Inställningar → Modell → Live conversation provider` | Unchanged shape, just relocated under the new menu structure. |
| Theme (light / dark / auto) | `Inställningar → Utseende` (or default location) | Preserved; accent palette per §05 applies on top. |
| Existing notification preferences (if v0.x has them — to be confirmed at implementation time) | `Inställningar → Notiser` | Mapped to per-trigger-kind toggles where possible; defaults for new fields. |
| Custom keyboard shortcuts (if v0.x has them — to be confirmed at implementation time) | Preserved if compatible; reset to defaults if the new shortcut set conflicts. User notified of conflicts in the post-upgrade welcome. | |
| Recap time | **New** — default 06:30 | User can change at first launch via welcome thread. |
| Quiet hours | **New** — default 02:00–05:00 | User can change; "detect from my activity" deferred per §07. |
| Dream-pass settings | **New** — defaults per §07 | |
| Memory retention defaults | **New** — 365 days per §02 | |
| Per-extension severity overrides | **New** — empty | User can override later in §06's per-extension settings view. |
| Auto-policies | **New** — empty | User opts in per §06's policy creation flow. |

A `settings_migration` activity log entry is written per setting that ran (one entry per mapping rather than one entry for the whole migration — easier to query, easier to undo individual mappings, fits the §02 "one source of truth" pattern). Each entry's `details` contains the source key, target key, and value.

### Scheduled-jobs migration in detail

- **During deprecation window**: job-fired path checks a per-job `use_event_flow` flag. New post-upgrade jobs default to `true` and call `emitEvent`; existing pre-upgrade jobs default to `true` after migration but can be temporarily flipped to `false` if a user reports a problem.
- **Job result history**: pre-upgrade results already live as messages in the legacy archived thread(s) (per the chat-history migration). No separate activity-log migration is needed — duplicating them as `auto_action` entries would muddy that kind's semantics (which require a `policy_id` and tool input/output that pre-upgrade results don't have). Search and `recall` reach the legacy threads normally.
- **After deprecation window** (in the named subsequent release): legacy code path is removed. The migration script for that release rejects any remaining jobs with `use_event_flow: false` (refusing to upgrade until the user converts them).

The scheduler-emits-event behavior itself is documented in §04 (boundary: scheduler success = `emitEvent` resolved; Stina-side failures don't cause scheduler retry).

### Post-upgrade first launch

A user who upgrades sees a different welcome than a first-time user (per §05's first-launch flow):

1. **Upgrade welcome thread** is created via `runtime.emitEventInternal` with `trigger: { kind: 'stina', reason: 'manual' }` and a clearly distinguishing title (e.g. *"Welcome back — things have changed"*).
2. **Content explains the new model briefly**: inbox, threads, recap, memory, three actors. A short paragraph each, no walls of text. Links to the docs site for users who want depth.
3. **Compatibility report from the extension audit** is rendered as inline cards in the welcome thread: green for compatible, amber for needs-update, red for broken (with the cascaded-revocation summary if applicable). Each card is clickable for details and includes the "report this to the developer" link for amber/red.
4. **Pointer to legacy threads**: an inline link *"Your previous conversation history is in N archived threads"* with a one-click open of the Archived segment.
5. **Setup actions**: same as first-launch (recap time, quiet hours, optional walk-through), but pre-populated with translated settings where available.
6. **In-flight items at upgrade**: if the quiescence step persisted any "in-flight at upgrade" markers, they're listed here as items to review.
7. **Pre-migration backup pointer**: *"Backup of your previous setup is available in Inställningar → Backup"* — so the user knows safety exists even if they don't read the rest.
8. **Skip-all** is available — user can dismiss and explore on their own. The upgrade welcome thread stays in the inbox until manually archived.

**Notification gating until welcome is opened.** Until the welcome thread is *opened* (not just created), the runtime suppresses all non-user-initiated notifications. This is a one-time gating condition tied to a `post_upgrade_welcome_acknowledged` flag set to `true` when the user opens the welcome thread or clicks "Skip-all". Without this gate, an upgraded background-launched app could fire notifications from a new model the user has not yet been introduced to.

For API/Web mode: the API server returns `503 + { code: 'post_upgrade_welcome_required' }` from event-emitting endpoints until the flag is set via the web UI.

The `migration_completed` activity log entry is written by the runner but **rendered specially in the welcome thread** rather than mixed into the morning recap's "today" feed — the entry semantically belongs with the upgrade story, not with everyday activity.

### Rollback strategy (honest deferral)

**v1 does not support in-place rollback** to the pre-redesign data model. The reasons:

- The schema changes are large and bidirectional migrators add significant complexity.
- The redesign introduces concepts (background threads, standing instructions, auto-policies) that have no v0.x equivalent — even a "rollback" would lose data the user created post-upgrade.
- Local-first means the user controls the install — there is no server-side enforcement preventing them from staying on v0.x.

**The safety net is the pre-migration backup.** Users who decide they want v0.x back can:

1. Uninstall the v1 release.
2. Reinstall the matching v0.x release (the backup filename includes the source version stamp to make this unambiguous).
3. Restore from the `.stina-backup` file via a documented CLI command (`stina restore <backup-path>`).

**The `stina restore` recovery utility is shipped with the v1 installer**, in a sibling location to the main binary (e.g. `Stina.app/Contents/Resources/bin/stina-restore` on macOS). This means it's available even if the v1 main binary is broken — exactly when the user is most likely to need it. It is a one-off recovery utility, not a general TUI/CLI surface (which §05 defers).

**Downgrade-without-restore protection.** A v0.x release that is started against a database carrying a v1 schema-version stamp newer than it understands will refuse to start, with a clear error message pointing to `stina restore`. This prevents silent corruption from manually downgrading.

### Schema versioning contract

The migration runner uses a stable schema-version mechanism so future migrations follow the same template:

- Each package owns a `migrations/` directory with files of the form `NNNN_<slug>.sql` (matching the existing pattern in `packages/chat/src/db/migrations/` and `packages/scheduler/src/migrations/`).
- A `schema_versions` table records `(package, version, applied_at)`.
- The migration runner, on every startup, applies any unapplied migrations in order per package, in topological package order.
- A skip-path (e.g. v1.0 → v1.7) just runs all unapplied migrations sequentially.
- The redesign-2026 migration is itself a set of numbered migrations under the new packages — it is not a separate one-off runner. The runner described above is the *general* runner; "redesign-2026" is the particular set of migrations it processes for this upgrade.
- The pre-migration backup mechanism is general too: the runner triggers a backup whenever it is about to run a migration set that exceeds a threshold (configurable per release in maintainer-side config — the redesign-2026 set is well above the threshold).

### File system layout

Per platform, the migration uses these paths:

| Artifact | macOS | Windows | Linux |
|----------|-------|---------|-------|
| App data root | `~/Library/Application Support/Stina/` | `%APPDATA%\Stina\` | `$XDG_DATA_HOME/stina/` (fallback `~/.local/share/stina/`) |
| Database | `<root>/data/stina.db` | `<root>\data\stina.db` | `<root>/data/stina.db` |
| Settings | `<root>/settings.json` | `<root>\settings.json` | `<root>/settings.json` |
| Backups | `<root>/backups/` | `<root>\backups\` | `<root>/backups/` |
| Dry-run reports | `<root>/backups/dry-runs/` | `<root>\backups\dry-runs\` | `<root>/backups/dry-runs/` |
| Migration marker | `<root>/migration-in-progress` | `<root>\migration-in-progress` | `<root>/migration-in-progress` |
| Migration logs | `<root>/logs/migration-<timestamp>.log` | `<root>\logs\migration-<timestamp>.log` | `<root>/logs/migration-<timestamp>.log` |
| Extension data dirs | `<root>/extensions/<extension_id>/` | `<root>\extensions\<extension_id>\` | `<root>/extensions/<extension_id>/` |

**Cloud-sync exclusion.** By default the app data root is *not* placed inside cloud-sync directories (Dropbox, iCloud Drive, OneDrive) — cloud sync of an open SQLite database can corrupt it. A user-overridable setting allows relocation if the user understands the risk.

### Beta-channel telemetry (opt-in)

Distribution channel does not equal consent. Telemetry is **opt-in via an explicit toggle in Inställningar → Telemetri**, default off, available on every channel.

When opted in, the migration runner can transmit a single `--dry-run` report to the maintainer-controlled endpoint. Exact JSON shape:

```json
{
  "schema_version_from": "v0.42.0",
  "schema_version_to": "v1.0.0",
  "platform": "macos",                    // macos | windows | linux only
  "row_counts": { "messages": 1247, ... },
  "extension_count": 3,
  "extension_registry_ids": ["a3b...", "9c2...", "..."],
  "audit_summary": { "green": 2, "amber": 1, "red": 0 },
  "dry_run_outcome": "would_succeed"
}
```

Excluded by design:

- No paths, no usernames, no tokens
- No extension *names* (registry IDs only — those are public)
- No memory content, no message content, no subject lines
- No backup file path

The user can preview the exact JSON that would be sent before opting in. The maintainer-controlled endpoint's retention policy is documented in the privacy page on the website (current intent: 90 days, then deleted).

### Verification approach

- **Per-package migration tests**: each new package ships its own migration test suite that runs against synthetic v0.x snapshots of varying age and content shape (small / medium / very large legacy chat).
- **End-to-end migration test**: takes a known v0.x DB, runs the full migration, validates the resulting state against expected fixtures (including the legacy-thread split heuristic on diverse inputs).
- **Beta `--dry-run` telemetry** (when user has opted in): catches edge cases real users hit that synthetic fixtures miss.
- **Manual upgrade from real installs**: maintainers test on their own running Stina installs (eat-our-own-dogfood) before public release.
- **Post-migration sanity-check coverage in CI**: the sanity checks themselves are tested with deliberately-broken post-migration states (a missing FK, a missing index, etc.) to verify they catch the problem.

### Failure handling

| Failure mode | Recovery |
|--------------|----------|
| Backup creation fails (disk, perms, extension dir unreadable) | Migration aborts before any changes; user sees clear error. |
| Per-package migrator throws | The whole SQLite transaction rolls back atomically (since the run is one transaction). Runner stops; in-progress marker stays; user offered backup restore on next launch. |
| Cross-package referential integrity check fails post-migration | Same as above. |
| Mid-migration process crash (OS kill, power loss) | SQLite rolls back the partial transaction at process death. In-progress marker present on next launch → runtime offers structured three-option dialog (Resume / Restore / Quit) per "Crash recovery" above. |
| Sanity check fails after all migrators succeed | Runner aborts the SQLite transaction (no commit); in-progress marker stays; user offered structured dialog as above. |
| Quiescence timeout fires with in-flight items remaining | Migration proceeds; per-item "in-flight at upgrade" markers persisted; surfaced in welcome thread for user review. |
| Extension load fails post-migration | Extension marked errored in the compatibility report; the rest of the app continues. User can disable the extension or wait for an update. |
| Scheduler job re-wire fails for a specific job | Job is left with `use_event_flow: false`; flagged in the post-upgrade welcome compatibility section. |

The recurring pattern: backup is the recovery path. We don't try to "fix forward" through complex partial-state recovery — too easy to corrupt data trying to be clever. Restore from backup, fix the migrator, re-run.

## Implementation checklist

- [ ] Pre-migration backup writer: full SQLite snapshot + settings JSON + installed-extensions manifest + each extension's data directory (gzipped) + schema-version stamps; gzip-compressed `.stina-backup` archive
- [ ] Backup filename includes source version: `pre-redesign-2026-from-v0.<minor>.<patch>-<timestamp>.stina-backup`
- [ ] `.stina-backup` format reserves room for an encryption header (encryption itself deferred to v1.x)
- [ ] Backup creation failure aborts migration with no writes (including unreadable extension data dirs)
- [ ] Backup retention policy: redesign-2026 backup kept until user removes; minor-migration backups auto-rotated (keep last 3); UI in Inställningar → Backup with size + age + source-version + delete-with-confirmation
- [ ] Pre-migration quiescence: block new entries; drain in-flight items; 60 s grace timeout; persist "in-flight at upgrade" markers if timeout fires
- [ ] Electron auto-updater: do not apply update while a Stina turn is in flight; defer up to 60 s with banner
- [ ] API server returns `503 + { code: 'upgrade_required' }` on schema-version mismatch with running clients
- [ ] Migration runner: single SQLite transaction (`BEGIN IMMEDIATE` … `COMMIT`) wrapping all per-package migrators
- [ ] Per-package migrations under `packages/<name>/src/migrations/` matching existing chat / scheduler patterns
- [ ] Topological package order: core → threads → memory → autonomy → chat → scheduler adapter
- [ ] `chat` migrator runs the legacy-thread split (idle-gap heuristic, default ≥ 24 h, configurable); creates one `archived` Thread per resulting segment with auto-generated title
- [ ] Legacy-thread split details logged to `settings_migration` so the user can audit the heuristic's output
- [ ] Migration runner writes structured `migration-in-progress` marker (started_at, phase, last_completed_package, backup_path, source_version, target_version); updates as packages complete; removes only after all sanity checks pass
- [ ] Crash recovery: marker present on next launch gates startup (no subsystems initialize); user shown three-option dialog (Resume / Restore / Quit) with diff of what would be lost; auto-restore is forbidden
- [ ] `--dry-run` mode for the migration runner with the scope defined in "Dry-run scope" (validates pre-conditions and forecast; writes single dry-run report; idempotent; no other side effects)
- [ ] Post-migration sanity checks (run before COMMIT): schema version stamps, legacy threads shaped correctly, settings keys with defaults, ActivityLogEntry tables queryable, **row-count parity**, **FK integrity**, **required indexes present**, **search-index population for legacy threads completes within target latency**, **backup file passes SQLite integrity check**, **extension data directory checksums unchanged**, **no dry-run residue**
- [ ] Sanity-check failure aborts the transaction (no COMMIT) and leaves the marker for the recovery dialog
- [ ] Legacy thread contents are queryable by `recall`; no auto-deletion
- [ ] `scheduler` adapter re-wires job-fired path to call `emitEvent`; pre-upgrade job-result chat messages already live in the legacy archived thread(s) (no separate activity-log migration)
- [ ] Per-job `use_event_flow` flag during deprecation window; subsequent named release removes legacy code path and refuses upgrade if flag still false
- [ ] Deprecation window tied to a specific subsequent release (e.g. v1.1) with a fixed calendar date announced at v1 ship time
- [ ] Extension API additions per matrix: `emitEvent`, `runtime.emitEventInternal` (runtime-only), `registerRecallProvider`, `ExtensionThreadHints` in manifest, tool manifest `severity` (defaults to `medium` at load + dream-pass flag for review), tool manifest `redactor` (optional), tool manifest `engines.stina` (optional), tool manifest `api_version` (recommended)
- [ ] Existing tool registration, configuration views, OAuth flows, right-panel widget code preserved unchanged
- [ ] Right-panel widget grandfathering: existing v0.x manifests with `contributes.widget` allowed; new manifests declaring `contributes.widget` warn at install ("widget feature disabled in v1") and proceed without the widget
- [ ] "Send to chat" deprecation: legacy method emits runtime warning during deprecation window; throws clear error pointing to `emitEvent` after the named subsequent release
- [ ] Extension developer audit CLI: `stina-extension audit ./my-extension` with green/amber/red signal and line-level warnings; ships with `@stina/extension-api`
- [ ] Extension audit at upgrade time uses the same checks as the developer CLI
- [ ] Extension audit categorizes each installed extension as green / amber / red with defined post-upgrade behavior (green enabled, amber enabled with guidance, red disabled with "View data anyway" affordance)
- [ ] Cascading effects of red extensions: bound `AutoPolicy` cascade-revoked with `details.cascaded_from: { kind: 'extension_uninstall', ... }`; `StandingInstruction` referencing the extension's tools flagged in next dream pass; surfaced in welcome thread
- [ ] Settings translation per the table; one `settings_migration` activity log entry per setting that ran (not one per migration)
- [ ] Post-upgrade first launch: distinguishing welcome thread (`reason: 'manual'`, title makes upgrade context clear), inline compatibility report cards, pointer to legacy archived threads, in-flight-at-upgrade items list, pre-populated setup actions, link to backup in settings
- [ ] Notification gating until welcome opened: `post_upgrade_welcome_acknowledged` flag; non-user-initiated notifications suppressed until set; flag set when user opens the welcome thread or clicks "Skip-all"; API mode returns `503 + { code: 'post_upgrade_welcome_required' }`
- [ ] `migration_completed` activity log entry rendered specially in the welcome thread, not mixed into morning recap's "today" feed
- [ ] `stina-restore` recovery utility shipped with the v1 installer in a sibling location to the main binary; runs even if the main binary is broken
- [ ] v0.x downgrade protection: refuse to start against a database with a newer schema-version stamp; error points to `stina restore`
- [ ] Schema versioning contract: numbered `NNNN_<slug>.sql` migrations per package, `schema_versions` table records `(package, version, applied_at)`, runner applies unapplied migrations in topological package order on every startup, supports skip-paths (v1.0 → v1.7)
- [ ] File system layout: documented per-platform paths for app data root, database, settings, backups, dry-run reports, migration marker, logs, extension data dirs
- [ ] Cloud-sync exclusion: app data root not placed inside cloud-sync directories by default; user-overridable setting
- [ ] Beta-channel telemetry: opt-in toggle in Inställningar → Telemetri (default off, available on every channel); exact JSON shape defined and previewable; no PII; registry IDs only (no extension names); maintainer endpoint retention documented in privacy page
- [ ] Per-package migration test suites against synthetic v0.x snapshots (small / medium / very large legacy chat)
- [ ] End-to-end migration test using known v0.x DB → expected post-migration fixtures
- [ ] Sanity-check coverage in CI: deliberately-broken post-migration states tested
- [ ] Documentation site has a dedicated upgrade page covering: backup, what changes, how to roll back if needed, deprecation window for extensions, telemetry opt-in

## Open questions

- **Idle-gap default for legacy-thread split** — 24 hours is a starting heuristic. Could be tuned per release based on real upgrader data. Validate that it produces reasonable thread counts (not 1, not 1000) for diverse user histories.
- **Backup encryption design for v1.x** — passphrase prompt at upgrade time, key derivation, key recovery. Worth a small dedicated design pass before v1.x lands.
- **Quiescence grace timeout** — 60 s is a guess. Real-world long-running scheduled jobs may need longer; consider per-item timeouts or a "negotiated drain" protocol where the runner asks each subsystem how long it needs.
- **Migration timing announcement** — when is the migration window between releases? Maintainer-side process question; not a spec issue, but worth coordinating before v1 ships.
- **Search-index target latency** — 200 ms is a starting guess. Validate against representative pre-existing chat corpora; the sanity check should refuse migration if performance would be unacceptable for real users.
- **Notification gating for users who never see the welcome** (long-term background-launch, headless install) — eventually the gating must time out (e.g. 30 days, the welcome auto-acknowledges with a recap entry noting it). What's the right timeout?
- **Telemetry endpoint long-term governance** — who owns the maintainer endpoint? Where does its data live? How is access controlled? Out of scope for the spec but needs an answer before opt-in is offered.
- **Auto-rotation of minor-migration backups** — "keep last 3" is a starting policy. Could be size-based instead. Validate when v1.x migrations actually start happening.
- **In-flight extension event handlers** — quiescence drains them, but what does an extension do when the runtime says "wrap up, you have 60 s"? Is there an extension-API hook for "graceful shutdown signal"? Probably yes for v1.x.
