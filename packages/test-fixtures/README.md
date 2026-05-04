# @stina/test-fixtures

Deterministic factories, scenarios, and a database seeder for the redesign-2026 schema. Used for:

- **Visual UI development** — populate the dev database with realistic-looking data without invoking the AI runtime.
- **Playwright UI tests (Phase B)** — same scenarios, asserted against rendered DOM.
- **§08 migration test suite (later)** — synthetic data sets for regression testing.

## Quick start

Seed the dev database with the typical morning state:

```sh
pnpm dev:seed typical-morning --fresh
```

Or pick another scenario; running with no argument lists them.

To target an isolated database (recommended for visual exploration so you don't trample your normal dev DB):

```sh
DB_PATH=/tmp/stina-demo.db pnpm dev:seed typical-morning --fresh
```

Then start the app pointing at the same path:

```sh
DB_PATH=/tmp/stina-demo.db pnpm dev:tui ext list   # or any UI
```

## Scenarios

| ID | What it shows |
|----|---------------|
| `fresh-install` | Empty inbox + welcome thread (first-launch state per §05) |
| `typical-morning` | Recap on top, one active surfaced mail, two background threads, older quiet threads, one archived. Exercises every segment from §05. |
| `vacation-mode-active` | Vacation auto-reply active. Four overnight mails auto-handled in background, one customer escalation surfaced via §06 collision handling. |

Add new scenarios in `src/scenarios/`. Each scenario is a pure function returning a `Scenario` object — no DB access, no side effects.

## API

```ts
import { seed, getScenario, makeThread, makeStandingInstruction } from '@stina/test-fixtures'

// Seed a database from a registered scenario
seed(rawSqliteDb, getScenario('typical-morning'))

// Or compose your own ad-hoc fixtures
const customThread = makeThread({ title: 'Custom', trigger: { kind: 'user' } })
```

The factories accept `Partial<T>` overrides, so you only specify what differs from the defaults.

## Determinism

All factories use `FIXTURE_NOW_MS` (a fixed UTC timestamp) as their time anchor. This means:

- IDs are stable across runs (counter-based per package).
- Timestamps are stable across runs (relative offsets from the fixed anchor).
- Snapshots and equality assertions don't drift.

Override `created_at`, `id`, etc. when you need different values for specific records.
