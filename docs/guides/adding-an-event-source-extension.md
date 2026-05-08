# Adding an Event-Source Extension

An event-source extension proactively emits typed events that spawn brand-new threads in Stina's inbox. This is different from a tool extension, which is invoked by Stina mid-conversation in response to a user request. An event source owns a polling loop, webhook listener, or scheduled job, and whenever something happens in its domain — a mail arrives, a calendar reminder fires, a scheduled summary is due — it calls `ctx.events.emitEvent(input)`. The runtime creates a thread, Stina runs her decision turn, and the thread becomes visible in "Inkorgen" once that turn finishes.

The §02 / §04 design contract: extensions do not deliver free-text messages or notifications. They emit typed events; Stina decides what to do with each one. This keeps the trust boundary clean and lets the runtime derive linked entities, fold them into memory context, and route threads to the right UI surface without parsing arbitrary strings.

Cross-links to other guides:
- Adding a tool that Stina calls mid-conversation: [adding-builtin-tool.md](./adding-builtin-tool.md)
- Adding a recall provider that supplies domain context to Stina's decision turn: [adding-a-recall-provider.md](./adding-a-recall-provider.md)
- Severity gating for tools: [adding-a-tool-with-severity.md](./adding-a-tool-with-severity.md)

## When to write an event source

Use this checklist to decide whether your extension needs the `emitEvent` path:

- **You have polling or push access to a domain** (mail, calendar, file system, IMAP) and want each new item to land in Stina's inbox — event source.
- **You receive webhooks** (Slack messages, GitHub events, Discord notifications) — same pattern: your extension hosts a small listener or polls an API, and each delivery becomes one `emitEvent` call.
- **You have a scheduled job** (`ctx.scheduler.register`'d) that should produce a thread when it fires — event source via `kind: 'scheduled'` (see the scheduled-trigger section below).
- **You want Stina to be able to initiate something on her own** (search the web, draft a document, look up a fact) — tool, not event source.
- **You want the user to be able to ask "what's in my mailbox?"** — tool, not event source.

Tools and event sources can coexist in one extension. The `packages/dev-test-extension/` extension demonstrates exactly this: it registers a `dev_test_emit_test_mail` tool (so Stina can call it) and three UI-button actions (so the user can trigger event emission directly from "Inställningar"), both calling `ctx.events.emitEvent`. That file is the canonical worked example for everything in this guide.

**Prerequisites.** This guide assumes you have already scaffolded an extension repo with a `manifest.json`, an `activate(ctx)` entry point, and the `@stina/extension-api` dependency. The closest existing scaffold reference is `packages/dev-test-extension/` itself — read its `manifest.json`, `src/index.ts`, and `package.json` cover-to-cover before starting. The other developer guides (`adding-a-recall-provider.md`, `adding-a-tool-with-severity.md`) show the `activate(ctx)` shape for other permission surfaces; this guide focuses on the event-emit path specifically.

## Step 1 — declare the permission

Add `"events.emit"` to the `permissions` array in `manifest.json`:

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "0.1.0",
  "type": "tools",
  "permissions": [
    "events.emit"
  ]
}
```

**One permission, two methods.** The same `"events.emit"` permission gates both the legacy `ctx.events.emit(name, payload)` method (which is `@deprecated` — do not use it for new code) and the new `ctx.events.emitEvent(input)` method. They are not separate permissions despite the API surface having two names.

Without this permission, `ctx.events` is `undefined` at activation and any call to `emitEvent` throws synchronously — see the footguns section.

## Trigger and content pairs

In v1, three trigger / content pairs are accepted. You must use a matching pair — `trigger.kind` must equal `content.kind`:

| Trigger kind | Content kind | When to use |
|---|---|---|
| `mail` | `mail` | New incoming email |
| `calendar` | `calendar` | Calendar invite or update |
| `scheduled` | `scheduled` | A scheduled job firing |

The full type shapes, from `@stina/extension-api`:

```typescript
// ExtensionThreadTrigger — accepted trigger kinds
type ExtensionThreadTrigger =
  | { kind: 'mail'; extension_id: string; mail_id: string }
  | { kind: 'calendar'; extension_id: string; event_id: string }
  | { kind: 'scheduled'; job_id: string }   // no extension_id field

// ExtensionAppContent — accepted content kinds
type ExtensionAppContent =
  | { kind: 'mail'; from: string; subject: string; snippet: string; mail_id: string }
  | { kind: 'calendar'; title: string; starts_at: number; ends_at: number; location?: string; event_id: string }
  | { kind: 'scheduled'; job_id: string; description: string; payload?: Record<string, unknown> }
```

### Mail trigger — verbatim from dev-test-extension

The canonical helper from `packages/dev-test-extension/src/index.ts`:

```typescript
function buildTestMailInput(): EmitEventInput {
  const mail_id = freshId('dev-test-mail')
  return {
    trigger: { kind: 'mail', extension_id: 'dev-test', mail_id },
    content: {
      kind: 'mail',
      from: 'fake@example.com',
      subject: 'Testmail från dev-test',
      snippet: 'Hej, det här är ett genererat testmail.',
      mail_id,
    },
    source: { extension_id: 'dev-test' },
  }
}
```

Note: `extension_id` appears three times in this object. The runtime stamps all three from the host's authoritative id — see the next section for what that means.

### Calendar trigger — diff against mail

```typescript
function buildTestCalendarInput(): EmitEventInput {
  const event_id = freshId('dev-test-cal')
  const starts_at = Date.now() + 30 * 60 * 1000
  const ends_at = starts_at + 60 * 60 * 1000
  return {
    trigger: { kind: 'calendar', extension_id: 'dev-test', event_id },
    content: {
      kind: 'calendar',
      title: 'Testmöte från dev-test',
      starts_at,
      ends_at,
      location: 'Konferensrum A',  // optional
      event_id,
    },
    source: { extension_id: 'dev-test' },
  }
}
```

### Scheduled trigger — diff against mail

```typescript
function buildTestScheduledInput(): EmitEventInput {
  const job_id = freshId('dev-test-job')
  return {
    trigger: { kind: 'scheduled', job_id },        // no extension_id on the trigger
    content: {
      kind: 'scheduled',
      job_id,
      description: 'Schemalagt testjobb från dev-test',
    },
    source: { extension_id: 'dev-test' },
  }
}
```

`payload?: Record<string, unknown>` is also accepted on `scheduled` content for carrying extra data (the `EmitEventInput` type allows it). The dev-test helper omits it; supply it when your scheduled job needs to pass structured fields beyond the description string.

### Scheduled-trigger canonical pattern with `scheduler.register`

Extensions that use `ctx.scheduler.register` and want the job firing to spawn a Stina thread call `emitEvent` from inside `onFire`. This requires both `"events.emit"` AND `"scheduler.register"` in `permissions[]`.

```typescript
export async function activate(ctx: ExtensionContext) {
  if (!ctx.events) throw new Error('requires events.emit permission')
  if (!ctx.scheduler) throw new Error('requires scheduler.register permission')

  ctx.scheduler.register({
    id: 'morning-summary',
    cron: '0 7 * * *',
    onFire: async () => {
      await ctx.events!.emitEvent({
        trigger: { kind: 'scheduled', job_id: 'morning-summary' },
        content: {
          kind: 'scheduled',
          job_id: 'morning-summary',
          description: 'Morning summary',
        },
        source: { extension_id: ctx.extension.id },
      })
    },
  })
}
```

The scheduler considers the job successful once `emitEvent` resolves (§04 line 172). If Stina's decision turn fails, the scheduler does not retry — that is a Stina-side failure, not a job failure.

### Shorthand — let the host emit for you

If your scheduled job's only purpose is "open a thread for Stina to handle", you can skip the `onFire` wiring entirely by passing an `emit` field on the schedule request:

```typescript
export async function activate(ctx: ExtensionContext) {
  if (!ctx.scheduler) throw new Error('requires scheduler.register permission')

  // Shorthand: pass `emit` on the schedule request and skip the onFire wiring.
  // The host emits a typed `kind: 'scheduled'` event when the job fires.
  await ctx.scheduler.schedule({
    id: 'morning-summary',
    schedule: { type: 'cron', cron: '0 7 * * *' },
    userId: ctx.user.id,
    emit: {
      description: 'Morning summary',
      // payload is optional — include it when the thread needs structured data
    },
  })
}
```

When `emit:` is set, the extension's `onFire` handler is **NOT** invoked for this job — the host emits the typed event directly. Use the manual `onFire` + `emitEvent` pattern shown above when you need extension-side logic (e.g. fetching live data, building the payload from an API call) before the thread spawns. Pick one or the other per job; mixing them on the same job means `onFire` is silently bypassed.

The `"scheduler.register"` permission is sufficient; `"events.emit"` is **not** required when using the shorthand (the host emits on your behalf, not your extension worker).

**Why typed payloads, not free text?** Typed payloads let the runtime derive linked entities from the content fields (the `from` address on a mail, the `event_id` on a calendar item), fold those into Stina's memory context, and surface events in the inbox UI without parsing arbitrary strings. See §04 line 47 ("No free text") and the §02 trust-boundary discussion. If your domain entity type does not yet have a schema (a Slack message, a GitHub PR), that is a v2 schema addition — not something to work around via `scheduled` with a JSON `payload` field, though `payload` is available for carrying extra data alongside the required fields.

**What about `system` / `extension_status` content kinds?** Those are rejected by the host. They are runtime-emitted only. If you need a "this extension is in trouble" signal, that path does not exist in v1; `extension_status` self-reporting is on the roadmap but not yet available.

## Step 2 — call `ctx.events.emitEvent(input)`

Minimal example:

```typescript
const result = await ctx.events.emitEvent({
  trigger: { kind: 'mail', extension_id: ctx.extension.id, mail_id: 'abc-123' },
  content: {
    kind: 'mail',
    from: 'sender@example.com',
    subject: 'Hej',
    snippet: 'Kort utdrag ur mailet...',
    mail_id: 'abc-123',
  },
  source: { extension_id: ctx.extension.id },
})
// result.thread_id is the newly created thread id.
```

### About the `extension_id` fields

The host stamps `trigger.extension_id` and `source.extension_id` from the calling extension's authoritative id; whatever you pass is silently discarded — no error, no warning, just overwritten. The `extension_id` fields are required by the public type, so pass `ctx.extension.id` to mirror what the host will write. This makes worked examples self-documenting and avoids type errors. But structurally, the runtime ignores the value — you cannot impersonate another extension, and you gain nothing by trying.

### About duplicate id fields (`mail_id`, `event_id`, `job_id`)

The same id appears on both `trigger` and `content`. This is intentional but it is NOT a dedup key. The trigger field is the stable handle the runtime uses to derive linked entities and may use in future deduplication (v2+). The content field is the durable payload preserved on the `AppMessage` forever.

**In v1 there is no dedup.** `ThreadRepository.create` always inserts a fresh row. Spec §04 line 56–57: "One event = one thread. No coalescing in v1." Your extension is responsible for tracking what it has already emitted. Use `trigger.mail_id` / `event_id` / `job_id` as a stable identity key in your own state to avoid creating a duplicate thread for an item you have already processed.

## The host's trust boundary

The host validates your `emitEvent` input before creating any thread. Here is what gets stamped and what gets rejected:

**Stamped (silent overwrite):**
- `trigger.extension_id` — set to the calling extension's authoritative id (mail and calendar triggers only; scheduled triggers have no `extension_id` field).
- `source.extension_id` — set to the calling extension's authoritative id.

**Rejected with a thrown error** (the promise rejects; your `await` throws):
- `trigger.kind === 'user'` or `trigger.kind === 'stina'` — deny-list. The `ExtensionThreadTrigger` type excludes these at compile time; if you cast around the type (e.g. parsing JSON), the host re-validates at runtime. This is the §02 trust boundary in code — extensions cannot impersonate user-typed input or Stina-origin events.
- `content.kind === 'system'` or `content.kind === 'extension_status'` — host-only content kinds, rejected.
- `trigger.kind !== content.kind` — mismatched pair. Always pair them: mail+mail, calendar+calendar, scheduled+scheduled.
- Missing required fields per the type definition.

## Lifecycle of a successfully emitted event

This is the most important section to understand before you start testing.

1. **Thread created.** `spawnTriggeredThread` in `@stina/orchestrator` creates a `Thread` with `status: 'active'`, `surfaced_at: null`, `notified_at: null`, `first_turn_completed_at: null`. The initial `AppMessage` (your typed content) is appended immediately.

2. **Pending-first-turn invisibility gate.** The thread does not appear in `GET /threads` (the default list), the inbox, the background filter, or search until `first_turn_completed_at` is set. `ThreadRepository.list` filters on `firstTurnCompletedAt IS NOT NULL` by default. This avoids the race where the user opens a thread that Stina has not yet reasoned about.

3. **Stina's decision turn runs** synchronously inside the host's `emitEvent` handler — `spawnTriggeredThread` `await`s `runDecisionTurn` before returning. Stina reads active standing instructions, profile facts matching linked entities, the typed message, and her system prompt. She may call tools. She then closes with one of:
   - A `normal`-visibility message addressed to the user — thread is surfaced (`surfaced_at` set), notification fires.
   - A `silent`-reasoning message and an `event_silenced` activity entry — thread stays background, no notification.
   - Collision handling per §06.

4. **Gate lifted.** `markFirstTurnCompleted` is called after the decision turn finishes (success path in `runDecisionTurn`, failure path in `applyFailureFraming`). The thread becomes visible. "Inkorgen" shows it within seconds.

5. **`emitEvent` resolves** with `{ thread_id }`. Because the host runs the decision turn synchronously inside the IPC handler, by the time your `await ctx.events.emitEvent(...)` returns, the turn has finished and the visibility gate has been lifted. Your extension uses `thread_id` for log correlation. (Note: §04 line 64 describes "resolves immediately… UI visibility is gated on first-turn completion" as the design intent — the v1 implementation is synchronous-by-IPC and the practical observation is that `thread_id` arrives only after the gate has been lifted. A future async-resolution refactor could decouple these without changing the public contract.)

**On failure** (model unavailable, tool error, malformed output): the runtime appends a `system`-kind framing `AppMessage` in Swedish ("Jag kunde inte bearbeta..."), calls `markSurfaced` and `markFirstTurnCompleted`, and writes an `event_handled` activity-log entry with `details.failure: true`. No automatic retry. `emitEvent` still resolves successfully — the failure was contained in-thread.

**Degraded mode.** After 5 consecutive failures within 60 seconds, the host enters degraded mode. Subsequent failures still create threads and apply failure framing, but the `suppressNotification` signal is set on the return value from `applyFailureFraming` so a future notification surface can aggregate rather than flood. An `extension_status: degraded_mode_entered` `AppMessage` is appended to the anchor thread (the 5th-failure thread). The host exits degraded mode after a successful turn, writing `extension_status: degraded_mode_exited` on the anchor.

## Linked-entity derivation — you do not do this

Extensions do not supply `linked_entities` on the `EmitEventInput`. The runtime derives them from your typed content. §04 line 53: "Linked entities are derived, not declared."

- **Mail content** → one `person` entity ref keyed by the lowercased sender email (parsed from `from`, which accepts both bare `email@example.com` and named `"Name <email>"` format).
- **Calendar content** → one `calendar_event` entity ref keyed by `event_id`, display name from `title`.
- **Scheduled content** → no linked entities. `job_id` is a scheduler-internal handle, not a domain entity.

The derivation runs synchronously inside `spawnTriggeredThread` before `threadRepo.create`, so the entities are available when `MemoryContextLoader` runs the decision turn. Profile facts about the derived person (from `stina-ext-people`, for example) automatically flow into Stina's system prompt. No extra API call needed from your extension.

## Step 3 — style the thread card with `ExtensionThreadHints`

Optional, but recommended for extensions that emit mail or calendar events. Declare `thread_hints` under `contributes` in `manifest.json`:

```json
{
  "id": "my-extension",
  "contributes": {
    "thread_hints": {
      "icon": "✉️",
      "accent": "blue",
      "card_style": "bordered",
      "badge": "MAIL"
    }
  }
}
```

All four fields are optional. See `packages/dev-test-extension/manifest.json` for a working example (plum accent, bordered, 🧪 icon, DEV badge). The visual rendering rules — which accent colors are accepted, what `bordered` vs `left-line` looks like — are in §05.

**Important callout: scheduled triggers do not get your hints.** The hint lookup is keyed by `trigger.extension_id` (resolved server-side per the Phase 7c wiring). Mail and calendar triggers carry that field, so threads from your mail or calendar events are styled with your hints. Scheduled triggers are `{ kind: 'scheduled'; job_id: string }` — there is no `extension_id` field on the trigger by design: multiple extensions share the scheduler infrastructure, and the trigger shape stays uniform across all of them. Threads spawned by your `kind: 'scheduled'` events will use trigger-kind defaults regardless of your `thread_hints` contribution. This is intentional, not a bug. Scheduled-event styling is a candidate for v2 if the need is validated.

## Step 4 — verify your event spawns a thread end-to-end

**Build and install:**

```sh
pnpm build                                              # in your extension repo
../dev-tools/install-extensions.sh <extension-name>    # from the stina/ workspace root
```

**Seed a fresh database and boot the dev server:**

```sh
DB_PATH=/tmp/stina-demo.db pnpm dev:seed typical-morning --fresh
DB_PATH=/tmp/stina-demo.db STINA_MASTER_SECRET=dev pnpm dev:web
```

**Trigger your event source.** How you do this depends on your extension. The dev-test extension provides two paths:

- A UI button at "Inställningar → Verktyg → Dev Test — utlös testevents" — click the relevant button to call `emitEvent` directly, no model required.
- A Stina-callable tool (`dev_test_emit_test_mail`) — ask Stina to call it, or route it from a thread.

Your own extension should have at least one testable emit path. If it polls IMAP, trigger a real test message; if it uses scheduler, call `onFire` directly in a test.

**Watch "Inkorgen"** — your thread should appear within a few seconds, once Stina's decision turn completes and `first_turn_completed_at` is set. If it does not appear, check whether `first_turn_completed_at` was set in the database.

**Inspect the thread:**

```
GET /threads/:id/messages    # original AppMessage + Stina's reply
GET /threads/:id/activity    # decision turn activity entries (event_handled, auto_action, etc.)
```

## Common footguns

**Forgetting `"events.emit"` in `permissions[]`** — `ctx.events` is `undefined` at activation. Any call to `ctx.events.emitEvent(...)` throws synchronously with a property-access error. The same permission gates both the legacy `emit` method and the new `emitEvent` method.

**Constructing `kind: 'user'` or `kind: 'stina'` triggers** — the `ExtensionThreadTrigger` type excludes these at compile time. If you cast around the type (for example, you are parsing incoming JSON and deserializing it directly into a trigger), the host re-validates at runtime and rejects with a thrown error. The deny-list is the §02 trust boundary; do not try to work around it.

**Constructing `kind: 'system'` or `kind: 'extension_status'` content** — same: compile-time-excluded, runtime-rejected. Use one of the three accepted content kinds.

**Mismatched `trigger.kind !== content.kind`** — the host rejects this. Always pair them: mail+mail, calendar+calendar, scheduled+scheduled.

**Hoping for an `importance_hint` field** — there is no such field in v1 (§04 line 51). Stina judges importance from typed content + memory + standing instructions. If Stina is misjudging a class of events, the right lever is a §06 standing instruction ("treat all calendar events from domain X as high priority"), not an emit-time hint.

**Trying to declare `linked_entities` on the input** — that field does not exist on `EmitEventInput`. The runtime derives them. If your domain entity type is not yet derived by the runtime (Slack messages, GitHub PRs, etc.), that is a v2 schema addition to `@stina/core`.

**Polling and emitting the same item twice** — your responsibility. The host does not deduplicate across `emitEvent` calls. One event = one thread, always. Use `trigger.mail_id` / `event_id` / `job_id` as a stable identity key in your own state (e.g. a `storage.collections` set of already-processed ids) to track what you have already emitted.

**Awaiting `emitEvent` does not mean "fire and forget"** — the v1 implementation runs Stina's decision turn synchronously inside the IPC handler (`spawnTriggeredThread` `await`s `runDecisionTurn` before returning the thread id). So your `await ctx.events.emitEvent(...)` blocks for the full turn, and by the time `thread_id` arrives, the visibility gate has already been lifted (success path or failure-framing path). Don't structure your code expecting fast resolution; if your extension fires bursts, expect each call to take as long as Stina takes. Don't poll the thread for a reply in your tool's `execute` either — the user sees the thread when it's ready.

**Letting `emitEvent` rejections halt your polling loop** — `emitEvent` can reject (host validation error, database error, wrong content/trigger pair, etc.). Wrap each call in `try/catch`, log the error, and continue your loop. A single bad event must not stop the extension from processing subsequent items. Persist the failed payload for retry on the next cycle if the error looks transient. Fatal configuration errors (missing permission, malformed manifest) are usually thrown synchronously at activation — those should propagate and stop the extension cleanly.

**Bursts of events under degraded mode** — `emitEvent`'s IPC round-trip includes Stina's decision turn (the turn runs synchronously inside the host's event handler before the call resolves). If your extension fires rapid bursts, subsequent decision turns queue serially per-host. Degraded mode kicks in after 5 consecutive failures in 60 seconds. Spreading burst emission across a short interval is friendlier to the AI provider's rate limits but is not strictly required.

## Reference: the canonical worked example

`packages/dev-test-extension/` is the canonical worked example for this entire guide. Read these files cover-to-cover:

- **`packages/dev-test-extension/manifest.json`** — `events.emit` permission + `thread_hints` contribution + tool and toolSettings contributions. 35 lines.
- **`packages/dev-test-extension/src/index.ts`** — three `buildTest*Input()` helpers (one per trigger kind), three UI-action-driven emit paths (so users can test without a model), and one Stina-callable tool (`dev_test_emit_test_mail`) that calls `emitEvent`. ~155 lines total.
- **`packages/dev-test-extension/package.json`** — the minimal package shape for a monorepo extension: `@stina/extension-api` as a dev dependency, `tsup` build, ESM output.

The dev-test extension proves the full `emitEvent` API surface end-to-end and is small enough to read in one sitting.
