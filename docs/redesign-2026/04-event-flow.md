# 04 — Event Flow

> Status: **Draft**. Builds on §02 (data model) and §03 (memory). Defines what happens from the moment an extension emits an event to the moment the user is (or isn't) notified.

## Intent

When something happens — mail arrives, a calendar reminder fires, a scheduled job triggers — the flow is:

```
event → extension emits → thread spawns → app speaks → stina decides → (silent | surfaced)
```

Stina is **always the decider**. The app never speaks directly to the user; it speaks to Stina inside the new thread, and Stina chooses whether to surface that thread to the user. Silenced events still produce a thread (in background state) and an activity log entry — they are auditable, not erased.

This section specifies the contract between extensions and the runtime, the lifecycle of a triggered thread, the decision turn Stina runs, and how the surfacing decision becomes a notification.

## Design

### Lifecycle of a triggered thread

1. **Extension calls `emitEvent(event)`.** A new `Thread` is created with the matching trigger kind and an initial `AppMessage` carrying the typed `AppContent`.
2. **Runtime invokes Stina's decision turn** for that thread. Her input includes active standing instructions, profile facts matching trigger entities, the trigger payload (rendered inside an untrusted-data wrapper), and her system prompt with the autonomy and memory sections.
3. **Stina acts.** She may call tools (subject to severity rules from §06), save memories, and either:
   - Produce a `normal` message addressed to the user → thread is **surfaced**, notification fires.
   - Produce only `silent` reasoning + an `event_silenced` activity log entry → thread stays **background**, no notification.
   - Trigger collision handling (Escalate / Skip / Solve differently per §06).
4. **Thread continues** like any other thread. If surfaced, the user can reply. If background, the thread stays in the inbox under a "background" filter; the user can open it explicitly. Either way, a future event or user action can re-engage the thread.

The same lifecycle applies regardless of trigger kind. Mail, calendar, scheduled, and user differ only in the trigger payload and (for `user`) the absence of a decision-turn → silent-by-default choice.

### Extension API: `emitEvent`

A new capability on the extension API (see §08 for migration). Signature (working draft — types live in §02):

```ts
interface EmitEventInput {
  trigger: Exclude<ThreadTrigger, { kind: 'user' } | { kind: 'stina' }>
  content: AppContent              // typed payload, NOT free text
  source: { extension_id: string; component?: string }
}

interface EmitEventResult {
  thread_id: string                // the Thread the runtime created
}
```

**No free text.** The extension cannot emit a free-text event. All payloads are typed `AppContent` per §02. New event kinds require a schema addition to `AppContent` (a deliberate friction so we know all event shapes the runtime ever sees).

**Internal emit path (runtime-only).** A separate internal API, `runtime.emitEventInternal(input)`, accepts the full `ThreadTrigger` union including `{ kind: 'stina', reason, dream_pass_run_id?, insight? }`. This is **not** exposed to extensions — it is reserved for the runtime itself (dream pass spawning insight threads, future internal triggers). Extensions calling `emitEvent` cannot impersonate Stina-origin events; the type system enforces the boundary. Otherwise the lifecycle, decision turn, and surfacing rules are identical to the public path.

**No importance hint in v1.** An earlier draft included an `importance_hint: 'low' | 'normal' | 'high'` field. We dropped it: Stina already judges importance from the typed payload + active standing instructions + profile facts, and an extension-declared hint without an audit trail or per-extension override is the same kind of attention-budget hijack §06 worries about for `severity`. If real-use data shows Stina misjudging in ways an extension could correct, we revisit this in v2 with both surfacing-policy and per-extension-distribution telemetry.

**Linked entities are derived, not declared.** An earlier draft let the extension supply `linked_entities`. The runtime instead derives entity refs from the typed `AppContent` (the `from` field of a mail, the `event_id` of a calendar item, etc.) and may ask installed extensions to resolve those into known entities (e.g. "is this mail address in the People extension?"). Keeping the derivation in the runtime keeps the trust boundary clean: extensions cannot suggest arbitrary cross-references into other extensions' data.

### Thread spawning rules

- **One event = one thread.** No coalescing in v1. If ten mails arrive in a minute, ten threads are created. The dream pass and recap absorb the noise; we do not pre-coalesce in the event path because that hides per-message decisions and complicates the memory model.
- **Thread is created *before* Stina's decision turn.** The thread exists as a data record from the moment the runtime accepts the event. If Stina's turn errors, the thread is still there to inspect (see Failure mode).
- **Initial state is `status: 'active'`, `surfaced_at: null`, `notified_at: null`.** Surfacing and notification happen later, if at all.
- **The trigger's source ownership rule:** the extension that emits an event becomes the canonical owner of the trigger reference. If the extension is later uninstalled, threads keep their `EntityRef` snapshots (see §02 open question on snapshot fields) but cannot fetch fresh data.

**Pending first turn — thread is invisible until the first decision turn completes.** A thread is created synchronously, but it does not appear in any UI surface (not the inbox, not the background filter, not search) until the first decision turn finishes (success or failure). This avoids the race where the user opens a thread that Stina hasn't yet reasoned about, and where their reply would collide with the in-flight decision turn. The price is a short visibility delay (the cost of one Stina turn). The benefit is a clean state machine: the user only ever sees threads that have a Stina position on them.

`emitEvent` still resolves immediately with the new thread id (so the calling extension can correlate logs), but the thread's UI visibility is gated on first-turn completion.

### Thread state: background, surfaced, notified

The redesign separates three things that look the same but aren't:

- **Background** (`surfaced_at: null`) — Stina has not addressed the user yet. The thread may exist with AppMessages, Stina's silent reasoning, tool calls. UI surfaces these under the "Silently handled" segment in the trådlista (per §05), not in the primary unread count.
- **Surfaced** (`surfaced_at` set) — Stina has produced at least one `normal`-visibility message addressed to the user. The thread belongs in the primary inbox.
- **Notified** (`notified_at` set) — A user-facing notification actually fired for this thread.

`surfaced_at` and `notified_at` are usually equal (Stina addresses the user → notification fires → both timestamps set in the same operation), but they can diverge:

- The user opens a background thread manually, then Stina later writes a normal message *while the user is already looking at it* — `surfaced_at` is set at Stina's message; `notified_at` may be skipped because the user is already engaged.
- A per-extension or per-trigger-kind notification rule in settings suppresses notification for a class of events. The thread can still surface; the notification doesn't fire.
- An aggregate notification fires once per degraded-mode entry (see Failure mode). The individual threads have `surfaced_at` (per failure framing) but `notified_at` is set only on the aggregate notification's anchor thread.

Both timestamps are monotonic: once set, they cannot be cleared. There is no "unsurface" or "un-notify" operation — they are audit-bearing facts. (`status: 'archived'` is independent and serves a different purpose.)

### Stina's decision turn

When the runtime invokes Stina for a triggered thread, her context is:

| Input | Source |
|-------|--------|
| System prompt (autonomy, memory, actor distinction) | static, versioned |
| Active standing instructions | from memory layer (§03) |
| Profile facts matching trigger entities | from memory layer (§03) |
| Trigger payload (`AppContent`) | rendered inside an untrusted-data wrapper |
| Available tools and their severity | from extension manifests |
| Thread metadata (id, trigger, surfaced_at = null) | from runtime |

She does **not** receive in this initial turn:

- Other threads' messages or summaries (use `recall` if needed)
- The full activity log
- Profile facts not matching trigger entities
- Standing instructions that aren't active (`valid_from / valid_until` filtered)

Her output for this turn is a sequence of:

1. Optional **tool calls** — subject to severity-based approval and §06 collision handling
2. Optional **memory creations** — per §03 extraction model, with inline confirmation patterns
3. Exactly one of these closing actions:
   - A **`normal`-visibility message** addressed to the user (surfaces the thread)
   - A **`silent`-visibility reasoning message** plus an `event_silenced` activity log entry (thread stays background)
   - An `action_blocked` activity log entry resulting from collision handling (the chosen alternative determines whether the thread surfaces)

The closing action is mandatory. Stina cannot end the turn without explicitly recording her decision; "silently doing nothing" is forbidden. This is what gives the user the "why did Stina (not) do X?" affordance from §01 principle 2.

#### Closing-action normalization

The model can produce malformed output. The runtime normalizes:

| Model output | Runtime treats as |
|--------------|-------------------|
| Zero closing actions (turn ends with only tool calls / memories) | Failure mode (see below) — surfaces the thread with a system message |
| One `normal` message + one `event_silenced` entry | Contradiction; first-emitted closing action wins, the other is downgraded to silent reasoning, an `action_blocked` log entry is written explaining the malformation |
| Multiple `normal` messages | All retained as visibility-normal; first one's emission is the surfacing moment |
| Multiple `event_silenced` or `action_blocked` entries | All retained; the thread remains background unless one of them is paired with a `normal` message |
| `normal` message with empty content | Failure mode |

The normalization rules are a runtime invariant, not a Stina prompt convention. They guarantee that *every* decision turn ends in a defined state — no ambiguous output ever leaves the thread in limbo.

### Reasoning ranking (guidance in the system prompt)

The system prompt for the decision turn instructs Stina to rank her response in this order:

1. **Does any active standing instruction match this event?** If yes, attempt to fulfill it (subject to severity / collision handling).
2. **Is the event itself something the user would clearly want to know about right now?** If yes, surface with a brief framing message.
3. **Is the event reasonably handled by silence?** If yes, write a short reasoning note (silent), produce `event_silenced`, and end the turn.

The ranking is not enforced in code — it's a prompt convention that aligns Stina's behavior with the principles. Open question: how heavily to lean on prompt vs. structured pre-checks. Leaning prompt-only in v1, with the option to add structured pre-checks if behavior drifts.

### Failure mode

If Stina's decision turn errors (model unavailable, tool runtime failure, malformed output, normalization rules trip a "no valid closing action"), the runtime must:

1. **Surface the thread** with a `system`-kind AppMessage explaining the failure: *"I couldn't process this event automatically — please review."*
2. **Log an `event_handled` activity entry** with `details.failure: true` and the error context.
3. **Not retry automatically.** The user can re-engage the thread; the runtime does not re-invoke Stina without user action, to avoid infinite-failure loops.

Surface-on-failure is the deliberate default. The alternative — silent failure — would let real events vanish without user awareness, which is the worst possible violation of "transparency over magic". The cost (the user occasionally seeing a "couldn't process" thread) is small and explicit.

#### Degraded mode (cascade defense)

A failing model or expired credential can fail *every* event in a row, producing a notification storm that itself violates the principle the failure-mode is trying to honor. The runtime detects this and switches to **degraded mode**:

- **Trigger**: ≥5 consecutive failures with the same error class within 60 seconds.
- **In degraded mode**: subsequent failed events still create background threads with the failure framing AppMessage and the `event_handled { failure: true }` log entry, but **do not fire individual notifications**. Instead, a single aggregate notification fires once per degraded-mode entry: *"Stina is having trouble processing events. 14 events received since 09:42 are waiting for review."*
- **Aggregate notification anchor**: the first failed thread of the degraded-mode entry. Its `notified_at` is set; subsequent failed threads have `surfaced_at` but `notified_at` remains null.
- **Exit**: the next successful decision turn ends degraded mode. The runtime writes an `extension_status` AppMessage on the anchor thread noting recovery and the count of events that were aggregated.
- **Audit**: degraded-mode entry/exit transitions are recorded as `extension_status` AppContent on the anchor thread, with structured detail.

Degraded mode is not optional — the architecture treats notification storms as a real failure to design around, not an edge case to ignore. The numbers (5 failures, 60 seconds) are starting defaults; tunable in settings.

### Notification rules

- **Notification fires at the moment of first surfacing**, unless suppressed by user settings or degraded-mode aggregation.
- **`Thread.notified_at` is set** when (and only when) a notification actually fires. The runtime sets this; UI does not.
- **Notification fires for failures** (per the failure mode), subject to degraded-mode aggregation.
- **Notification does NOT fire** for `event_silenced` outcomes, background threads, memory creations, Stina's tool calls within a background thread, or threads suppressed by user settings.
- **Notification content** is the first user-addressed `normal` message Stina produced (or the failure framing). Title comes from the thread's `title`.
- **Per-extension or per-trigger-kind notification suppression** lives in user settings; the runtime checks the suppression rules before firing. UI design for the suppression panel is in §05 (Inställningar → Notiser).

### Scheduled jobs as triggers

The existing scheduled-jobs system (`packages/scheduler`, recent migration `0003_add_run_status.sql`) integrates by emitting events of `kind: 'scheduled'` when a job fires. Today's "send a chat message" pattern is replaced with "open a thread". The job's `description` and any structured payload are wrapped in `AppContent { kind: 'scheduled', ... }`.

**Boundary between scheduler and §04.** The scheduler considers a job successful when `emitEvent` resolves (i.e. the runtime accepts the event and creates a thread). Failures inside Stina's decision turn are §04's problem, handled by the failure mode (and degraded mode if applicable). The scheduler does **not** retry the job on Stina-side failure; that would create a duplicate-thread cascade. The job's run history records "fired and emitted" as success; the corresponding thread's failure (if any) is tracked in the activity log.

**Migration path.** Existing "send chat message" jobs are not flag-day cut over. The migration introduces `emitEvent` alongside the legacy chat-message path; existing jobs continue to function until they're rewritten or auto-converted by the migration script. After the migration window (length TBD in §08), the legacy path is removed.

This means the scheduled-jobs runtime no longer needs its own user-facing surface — every new job fire becomes a thread that goes through the same Stina decision turn, and the thread's surfacing decision is the user-facing event. Settings for scheduled jobs migrate into the unified activity surface (per §02 ActivityLogEntry retention defaults; "scheduled-jobs list" UI/layout is reused for the activity log).

### Concurrency model: per-thread FIFO queue

Each thread has a single in-flight Stina turn at a time. The runtime maintains a per-thread FIFO queue of "things to process" (incoming events to the same thread, user replies, follow-up app messages). The queue head is processed; on completion, the next item is processed. Failures pause the queue but do not drop items (the user re-engaging the thread resumes processing).

Key properties:

- **Per-thread serialization.** Two events targeting the same thread (rare, but possible if an extension chooses to inject a follow-up) are processed in arrival order. There is no parallel Stina turn within a thread.
- **Cross-thread parallelism.** Different threads run independently. The runtime can process N threads concurrently up to a worker-pool size (configurable; default sized for local model throughput).
- **User reply enqueue.** When the user types into a thread, their message is enqueued like any other input. If Stina is mid-turn, the reply waits; if idle, the reply triggers a new turn immediately.
- **Memory writes are serialized through a single writer** (per §03), regardless of which thread requested them. This avoids cross-thread races on standing-instruction creation/edit.
- **Activity log is append-only and crash-safe.** Entries are written before the action completes; a crash mid-action leaves a "started" entry that the recovery path can reconcile.

This resolves §02's concurrency-model open question for the event/thread layer. (Memory-layer concurrency is §03's responsibility but uses the same single-writer pattern.)

### Cost discipline (deferred)

Per design discussion: not optimized in v1. Every event runs a full Stina decision turn. Two-tier triage (cheap classifier or rule-based pre-filter, full Stina only for ambiguous cases) is deferred to phase 2. The architecture does not preclude it: a pre-filter can be inserted between `emitEvent` and the decision turn without changing extension API or thread schema.

**Architecture must allow batched turns, not just earlier rule-out.** A flood of related events (10 mails from the same sender in a minute) doesn't only need cheap pre-filtering — it needs the option of *one* Stina turn processing N events together, both for cost and for coherent reasoning ("you got 10 mails about X — here's what's going on"). The decision-turn interface must accept batched input from day one (even if v1 always passes a batch of 1), so that v2 batching doesn't require a schema or API change.

Trigger for adding the pre-filter and/or batching: real cost data showing it's needed, or user complaint about responsiveness on high-volume event sources (mail being the obvious one).

## Implementation checklist

- [ ] Extension API: `emitEvent(input: EmitEventInput): Promise<EmitEventResult>` available to all extensions
- [ ] `EmitEventInput` shape contains `trigger`, `content`, `source` only — no `importance_hint`, no `linked_entities` in v1
- [ ] `runtime.emitEventInternal(input)` exists as a runtime-only API accepting the full `ThreadTrigger` union (including `{ kind: 'stina', ... }`); not exposed via the extension API surface
- [ ] `Thread.surfaced_at` and `Thread.notified_at` schema fields, default `null` on creation (requires §02 schema migration)
- [ ] Thread spawned synchronously on `emitEvent`, before Stina's decision turn runs
- [ ] Thread is invisible in any UI surface until first decision turn completes (success or failure)
- [ ] `emitEvent` resolves with thread id immediately, regardless of decision-turn completion
- [ ] Decision-turn input loader: active standing instructions + matching profile facts + trigger payload (in untrusted-data wrapper) + tool manifests with severity
- [ ] Runtime derives `linked_entities` from typed `AppContent` fields (and may resolve via installed extensions); extensions cannot supply linked entities
- [ ] Decision turn must end with exactly one closing action; normalization rules apply to malformed model output (zero/multiple/contradictory closing actions → defined runtime treatment, see Closing-action normalization)
- [ ] Surfacing is monotonic: once `surfaced_at` is set, it cannot be cleared
- [ ] `notified_at` is set by the runtime when (and only when) a notification actually fires; user manually opening a background thread does not set either field
- [ ] Notification fires on first surfacing and on failure-mode entries, subject to per-extension/per-trigger-kind suppression and degraded-mode aggregation
- [ ] Failure mode: error during decision turn surfaces the thread with a `system` AppMessage and `event_handled` log entry with `details.failure: true`; no automatic retry
- [ ] Degraded mode: ≥5 consecutive failures with same error class within 60s switches to aggregated notifications; exits on next successful turn; transitions logged as `extension_status` AppMessages on the anchor thread
- [ ] Scheduled-jobs runtime emits events of `kind: 'scheduled'` instead of writing chat messages directly; scheduler considers the job successful when `emitEvent` resolves; Stina-side failures do not trigger scheduler retry
- [ ] Migration coexists with legacy "send chat message" path during a deprecation window (length per §08)
- [ ] One event = one thread; no event coalescing in v1
- [ ] Per-thread FIFO queue: one in-flight Stina turn per thread; cross-thread runs in a worker pool (size configurable)
- [ ] User replies are enqueued like any other input
- [ ] Memory writes serialized through a single writer (per §03)
- [ ] Activity log entries written before the action completes (crash-safe; recovery path reconciles "started" entries)
- [ ] System prompt for the decision turn includes the reasoning ranking guidance (standing instruction match → user-relevant new info → silence)
- [ ] Decision-turn interface accepts a batch of N events as input (v1 always passes N=1, but the API does not preclude N>1 for deferred batching)

## Open questions

- **Event coalescing in v2**: a flood of related events (10 mails in a minute) creates 10 threads. Should v2 add coalescing rules, and if so per-kind or universal? Likely needs real-use data to design well. Architecture allows N→1 batched turns (decision-turn interface accepts a batch).
- **Throttling / batching at the user level**: standing instructions like "batch low-priority mail and tell me at lunch" are reasonable. This is a Stina behavior pattern (she silences and queues, then surfaces a summary at the right time) using existing primitives — no new runtime feature needed in v1.
- **Degraded-mode tuning defaults**: 5 failures / 60 seconds is a starting guess. Validate with real failure scenarios. Should the threshold scale with event volume?
- **Failure-mode retries (explicit button vs. just engage)**: leaning toward "open the thread, type something" as the natural retry signal. No explicit retry button in v1.

**Resolved (recorded in Design above):**
- ~~**Background-thread visibility in the UI**~~ — resolved in §05: background threads live in a collapsible "Silently handled" segment of the trådlista, with a counter (`"Silently handled (N since last visit)"`) that resets on segment expansion. Audit affordance, not primary inbox content.
- ~~**Standing instruction matching mechanism**~~ — resolved in §03 "Standing-instruction matching": Stina judges at event time (LLM), with active instructions loaded into thread-start context.
- ~~**Per-thread serialization / concurrency**~~ — per-thread FIFO queue with cross-thread parallelism in a worker pool. See "Concurrency model" above. Resolves §02's concurrency-model question for the event/thread layer.
- ~~**Extension reauth notification path**~~ — uses `AppContent { kind: 'extension_status' }` per §02. The host's `system` kind is reserved for the runtime itself.
- ~~**`importance_hint` from extensions**~~ — dropped from v1. Stina judges importance from payload + memory + standing instructions. Revisit in v2 with telemetry if needed.
- ~~**Closing-action enforcement**~~ — runtime normalization rules apply (zero / multiple / contradictory closing actions have defined treatment). See "Closing-action normalization" above.
- ~~**Pending first turn**~~ — thread is invisible in any UI surface until the first decision turn completes (success or failure). See "Thread spawning rules" above.
