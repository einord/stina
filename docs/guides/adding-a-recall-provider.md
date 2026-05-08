# Adding a Recall Provider

A recall provider is an extension hook that lets the host pull domain-specific context into Stina's decision turn. When a new thread starts, `MemoryContextLoader` queries every registered provider for each `linked_entity` in the thread — for example, the sender's email on a mail-triggered thread — and injects the returned results under `## Information från extensions` in Stina's system prompt. The extension keeps its domain data (contacts, tasks, calendar entries) in its own storage; recall is the bridge, not a copy mechanism. Do not duplicate data into `ProfileFacts` — that table is for Stina-managed memory, not extension domain data.

## When the host calls your provider

The host calls registered providers at thread start, **once per `linked_entity`** in the thread:

- **Mail trigger** — the sender's email, already lowercased by the host before the `linked_entity` is created.
- **Calendar trigger** — the raw `event_id`, passed through verbatim.
- **Scheduled trigger** — no `linked_entities`, so no recall queries.

Each provider is invoked in parallel via `Promise.allSettled` semantics in the registry. Your handler failing does not break other providers or the decision turn.

**Your handler is called for every linked entity in the thread, not only ones your extension produced.** A People extension receives calendar `event_id`s; a Work extension receives email addresses. Recognise your own keys — by prefix, shape, or storage lookup — and return `[]` for keys you don't own.

The `scope` field on `RecallQuery` is `['extensions']` when the host calls your provider, but the registry does not filter on it in v1. It is a forward-compatibility field only. Do not gate your logic on `scope`.

Future: when Stina explicitly invokes recall mid-turn (R4, not yet shipped), the same handler will be called with a different `query.query` value.

## Step 1 — declare the permission

Add `"recall.register"` to the `permissions` array in `manifest.json`:

```json
{
  "id": "my-extension",
  "permissions": [
    "storage.collections",
    "recall.register"
  ]
}
```

Without this permission, `ctx.recall` is `undefined` at activation and `registerProvider` is never available. The extension will log nothing wrong — it just silently has no recall provider.

## Step 2 — implement the handler

The handler signature is `(query: RecallQuery) => Promise<RecallResult[]>`.

```typescript
import type {
  RecallProviderHandler,
  RecallQuery,
  RecallResult,
} from '@stina/extension-api'

import type { MyRepository } from './db/repository.js'

/** Extension id from manifest — used as source_detail per the v1 contract. */
const SOURCE_DETAIL = 'my-extension'

export function createMyRecallProvider(repo: MyRepository): RecallProviderHandler {
  return async (query: RecallQuery): Promise<RecallResult[]> => {
    // Guard: don't hit storage with an empty needle.
    const raw = typeof query.query === 'string' ? query.query.trim() : ''
    if (!raw) return []

    // Normalise: lowercase/trim defensively. The host already lowercases mail
    // emails before they become a ref_id. Calendar event_ids are passed
    // verbatim, but lowercasing costs nothing and makes the handler robust to
    // future entity types.
    const needle = raw.toLowerCase()

    // Recognise-or-bail: if the key shape isn't something this extension can
    // match, return [] rather than running a noisy storage scan.
    if (!looksLikeMyKey(needle)) return []

    let item: MyItem | null = null
    try {
      item = await repo.findByKey(needle)
    } catch (error) {
      // Never throw from a recall handler. Errors cross the worker boundary
      // and the host catches them via the registry's onError callback, but
      // the result for this turn will be "no results" regardless.
      return []
    }

    if (!item) return []

    // Optional pattern: fire-and-forget engagement tracking.
    // A write failure here must not slow or fail recall.
    void repo.touchLastMentioned(item.id).catch(() => undefined)

    const results: RecallResult[] = [
      {
        source: 'extension',
        source_detail: SOURCE_DETAIL,
        ref_id: item.id,
        content: formatContent(item), // aim for ≤300 chars
        score: 1.0,                   // exact match → strongest signal
      },
    ]

    // Honor query.limit when the caller provides one.
    const limit = typeof query.limit === 'number' && query.limit > 0 ? query.limit : undefined
    return limit !== undefined ? results.slice(0, limit) : results
  }
}

function looksLikeMyKey(_value: string): boolean {
  // STUB — always returns false so the handler bails for every query until
  // you fill this in. Replace with whatever discriminator your domain uses.
  // Examples: value.includes('@'), value.startsWith('item-'), value.length === 36 (uuid).
  return false
}

function formatContent(item: MyItem): string {
  // Keep content short. The host truncates each result over 500 chars to 499 chars + `…` and applies
  // an 8000-char section budget across all providers. Staying at ≤300 chars
  // protects your results from being cropped by a verbose competitor.
  const text = `${item.name} — ${item.description ?? ''}`
  if (text.length > 300) return text.slice(0, 299).trimEnd() + '…'
  return text
}
```

### Return shape

Each `RecallResult` must have:

| Field | Value |
|-------|-------|
| `source` | `'extension'` |
| `source_detail` | your extension id (used as a dedup key) |
| `ref_id` | your internal id for the item |
| `content` | one short, model-readable sentence — aim ≤300 chars |
| `score` | `0–1`; `1.0` for exact match, `0.8` for soft match, `0.5–0.7` for fuzzy |

The host sorts results by `score` descending before applying the 15-result cap and the 8000-char section budget. A `score: 0` result sorts dead-last and is the first to be dropped when the budget is tight.

### USER-SCOPING NOTE (v1 limitation)

`RecallQuery` carries no `userId`. The handler runs in the extension worker, where `ctx.storage` was set up at activation time against the default (extension-wide) scope. Single-user installs — the common case for Stina — are correct as-is. Multi-user scoping is a known v2 spec change tracked stina-side. Do not attempt to work around this here.

## Step 3 — register from `activate()`

Use direct access via `ctx.recall?`. No cast is needed — `recall` is a first-class optional field on `ExtensionContext`.

```typescript
import type { ExtensionContext } from '@stina/extension-api'
import { createMyRecallProvider } from './recall/myRecallProvider.js'
import { MyRepository } from './db/repository.js'

export async function activate(ctx: ExtensionContext) {
  const disposables: { dispose(): void }[] = []

  // Init storage first — the handler closes over the repo.
  if (!ctx.storage) {
    ctx.log.warn('Storage not available; recall provider disabled')
    return { dispose: () => {} }
  }

  const repo = new MyRepository(ctx.storage)

  // Register after storage is ready.
  const d = ctx.recall?.registerProvider(createMyRecallProvider(repo))
  if (d) disposables.push(d)

  return {
    dispose: () => disposables.forEach((d) => d.dispose()),
  }
}
```

Two things to note:

- **Register after storage init.** The handler closes over the repo; registering before the repo is ready causes a race.
- **Push the disposable.** The host auto-unregisters the provider when the extension is unloaded, but adding the disposable to your cleanup array is good practice and keeps activation logic self-contained.

One provider per extension is supported. A second `registerProvider` call within the same activation replaces the first handler (the generation counter increments). The `Disposable` from the first call becomes a silent no-op once replaced — intentional, but surprising if you are debugging "why didn't dispose() do anything".

## Step 4 — verify it works

Build and install the extension into the local dev environment:

```sh
pnpm build                                                     # in the extension repo
../dev-tools/install-extensions.sh my-extension   # path is relative to the stina/ workspace root
```

Seed a fresh database with a thread that has a `linked_entity` your provider can match:

```sh
DB_PATH=/tmp/stina-demo.db pnpm dev:seed typical-morning --fresh
```

Boot the API:

```sh
DB_PATH=/tmp/stina-demo.db STINA_MASTER_SECRET=dev pnpm dev:web
```

Open a thread whose trigger entity your provider handles (e.g. a mail-triggered thread from a known sender).

**Two ways to confirm a hit:**

1. **Without a real AI provider configured** — the canned stub appends `Z extensionsnotering(ar)` to its reply, where Z is the total recall result count. This fires only when no AI provider extension (e.g. `stina-ext-ollama`, `stina-ext-openai`) is loaded; the canned stub then takes over the entire decision turn. The simplest path is to disable your AI provider extension for this verification round — the recall provider extension itself stays installed and registered.

2. **With a real AI provider configured** — inspect the persisted `StinaMessage` in the database, or check your model's request log for the `## Information från extensions` section in the system prompt. That section is always present when recall results were returned, regardless of which producer ran.

## Common footguns

**Forgetting `recall.register` in `permissions[]`** — `ctx.recall` will be `undefined` at activation. The code silently no-ops with no error or warning.

**Forgetting `storage.collections` in `permissions[]`** — if your handler depends on a storage collection but the manifest does not request it, `ctx.storage` is `undefined`. The activate guard `if (ctx.recall && ctx.storage)` then falls through and registration is skipped, with only a `log.info("Recall API not available; recall provider disabled")` to point at the cause. Easy to miss in a busy log.

**Throwing from the handler** — the host's registry catches it and fires the `onError` callback (logged as a warning), but the result for that turn is "no recall results". Catch your own errors and return `[]`.

**Cross-entity contamination** — your handler is called for every `linked_entity` in the thread, including ref_ids your extension never produced. A People extension receives calendar `event_id`s; a Mail extension receives person ids. Always recognise your own key shape and return `[]` for unknown keys.

**Returning `score: 0`** — sorts dead-last; first to be cropped by either the 15-result cap or the 8000-char section budget.

**Verbose `content`** — a 1500-char blurb may individually survive (the host truncates each result over 500 chars to 499 chars + `…`), but in aggregate it eats more of the 8000-char section budget, starving later providers. Keep content at ≤300 chars.

**Registering before storage is ready** — call `registerProvider` after your storage or repository init in `activate`, since the handler closes over those objects.

**Hot-reload re-registration** — if you call `registerProvider` a second time within the same activation (e.g. during a watch-mode rebuild), the generation counter increments. The `Disposable` from the first call becomes a silent no-op. This is intentional, but it can be confusing when debugging why `dispose()` did not unregister the provider.

**v1 limit — no `userId` on `RecallQuery`.** The field does not exist; do not check for it or branch on it. The provider runs in the extension worker with `ctx.storage` set up at activation time against the extension-wide scope. Single-user installs are correct as-is. Multi-user scoping is a known v2 spec change tracked stina-side; mirror the USER-SCOPING NOTE pattern from the worked example rather than inventing a workaround. (See Step 2 for the longer explanation.)

## Reference: the canonical worked example

`stina-ext-people/src/recall/peopleRecallProvider.ts` (~155 lines, 7 unit tests) is the reference implementation. It matches the incoming query against the People collection by email first (score 1.0), then by name (score 0.8), skips archived people, honors `query.limit`, and fires-and-forgets a `touchLastMentioned` bump on a successful match. Person content is rendered as `"<name> — <relationship>. <description>"` and capped at 300 chars. The file also contains the USER-SCOPING NOTE in its module-level doc comment, which is the authoritative explanation of the v1 single-user limitation.
