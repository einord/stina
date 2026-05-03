# 07 — Dream Pass

> Status: **Draft**. Periodic background pass that consolidates memory and produces input for the morning recap. Builds on §02 (data model), §03 (memory), §04 (event flow concurrency).

## Intent

Periodically, when the system is idle, Stina runs a "dream pass" to consolidate memories, summarize quiet threads, prune expired data, and prepare flags for the morning recap. This avoids the question of "when is a thread done?" — threads simply go quiet and get processed asynchronously.

Hard rules — non-negotiable, constrain everything else in this section:

- **Never fabricate new facts.** Only consolidate, summarize, prune, flag.
- **Never overwrite user-set memories.** The "What dream pass may touch" table below makes the boundary precise. Stina-extracted memories may be edited, expired, or summarized; user-set memories are read-only.
- **Always log changes.** Every modification produces an `ActivityLogEntry`; the user can see exactly what changed and undo individual changes.
- **Never run on top of active work.** Idle trigger only. Yield to user/event activity when either appears mid-pass.
- **Dream-pass changes are visually distinct.** The activity log inspector and inline rendering both surface the dream-pass origin, so the user can always answer "did I do this, or did Stina do this asleep?"

## Design

### What dream pass may touch

The "never overwrite user-set memories" rule needs to be precise about *which* fields it protects. The runtime asserts these constraints before any write.

| Memory & field | Dream pass may | Dream pass may not |
|----------------|----------------|---------------------|
| `StandingInstruction.rule` (text) | — | Edit, ever |
| `StandingInstruction.scope` | — | Edit |
| `StandingInstruction.valid_until` | Honor it (auto-expire when passed; this is *user intent*, not overwrite) | Move it earlier or later |
| `StandingInstruction.invalidate_on` | Evaluate the conditions (auto-invalidate `event` matches; flag `user_says` matches for confirmation) | Add or remove conditions |
| `created_by: 'user'` instructions in stale-fact / oversize / contradiction detection | Flag in recap | Auto-resolve, edit, or delete |
| `created_by: 'stina'` instructions | Edit, expire, or delete (with `memory_change` log entry) | — |
| `ProfileFact.fact` / `subject` / `predicate` (any `created_by`) | — | Edit |
| `ProfileFact` deletion | Only if `created_by: 'stina'` AND user has explicitly approved deletion | Auto-delete user-set facts |
| `ThreadSummary` | Create, update, regenerate | — |
| `Thread.status` | — | Mutate directly (see "Waking threads") |

The runtime's memory writer asserts `created_by !== 'user'` for every dream-pass-origin mutation. A failed assertion is a hard fault: the change is not committed and a `dream_pass_flag` of `kind: 'rule_violation'` is written for diagnosis.

### Trigger conditions

Dream pass runs when **all** of:

1. **Idle window** — no user activity (typed input, thread interaction) for ≥ 60 minutes (configurable).
2. **Quiet hours** — current time falls within user-configured quiet hours (default `02:00–05:00` local time). Defaults to a "user is asleep" assumption; shift workers can customize.
3. **Cooldown** — at least 6 hours since the last dream pass started (default; configurable). Prevents thrashing if the user has multiple long idle stretches in a day.

**Max-gap guarantee.** If no dream pass has run in 48 hours (configurable), the next idle window of ≥ 30 minutes triggers a pass *regardless* of quiet hours. This protects users whose schedule never satisfies the conjunction (night-shift workers, travelers across time zones, etc.) from going indefinitely without consolidation.

**Explicit triggers.** Two paths:

- **Pre-recap.** Right before the configured recap time, even if quiet hours have passed, so the recap has fresh artifacts. The recap render coordinates with this pass — see "Recap composition" below.
- **User-demanded.** "Run dream pass now" in settings. Useful for testing and for users who want to consolidate before reviewing. Tasks that need historical data (stale-fact detection, oversize-count flag) short-circuit gracefully on first-install or sparse-data systems — they only emit flags when there is actually something to flag.

### Tasks performed in a pass

Each task runs as its own transaction. Tasks 1–2 (thread summarization) fan out across the cross-thread worker pool from §04 — independent per-thread, embarrassingly parallel. Tasks 3–8 are sequential.

Failures within one task are caught (recorded in `dream_pass_run.details.task_failures[]`) and do not abort the rest of the pass.

1. **Summarize threads that transitioned to `quiet`** since the last pass — generates `ThreadSummary` records. Parallel by thread.
2. **Re-summarize threads** whose `ThreadSummary.message_count_at_generation` is materially behind the count of *user-meaningful* new messages on `Thread.last_activity_at` (threshold: > 5 new messages or > 50% growth, whichever is smaller). **Silent dream-pass messages do not count toward this threshold** — only user/Stina/app messages with user-meaningful content. Parallel by thread.
3. **Expire standing instructions** whose `valid_until` has passed; emit `memory_change` entries. Bound `AutoPolicy` records cascade-expire transactionally per §06 "Policy ↔ standing instruction lifecycle".
4. **Evaluate `invalidate_on` conditions** for active standing instructions:
   - `event` — auto-invalidate if the named signal has been observed since the instruction was created.
   - `user_says` — Stina-judged with confidence threshold. Only flag if confidence is high (matches strength above `0.75`). Each flag has a `dedup_key` of `user_says:${instruction_id}:${user_message_id}` so the same false positive cannot recur — once dismissed, the dedup key is tombstoned. Flagged matches require user confirmation; never auto-invalidate.
5. **Check standing instructions against passive signals** (e.g. *"user has been active during what was supposed to be vacation"*). Flag in recap; do not auto-invalidate. Same `dedup_key` mechanism.
6. **Detect contradictions** between profile facts. **v1 advisory mode**: structural match only — same `subject` and same `predicate` (string-equal) with different `fact`. This will miss semantic duplicates ("manager_is" vs. "boss" describing the same relationship). Full semantic-similarity contradiction detection is a follow-up gated on §03's resolution of (a) controlled `predicate` vocabulary or (b) embedding-backed similarity. Until then, task 6 ships in advisory mode and is documented as such.
7. **Flag stale profile facts** — facts whose `last_referenced_at` is older than a configurable threshold (default 180 days) without being reinforced are flagged for user review. Never deleted by dream pass; the user makes the call.
8. **Flag oversize active-standing-instruction count** — if active instructions exceed the soft cap (default 30), one flag for consolidation. Dream pass does not auto-merge.

The pass meta entry (`dream_pass_run`) is written as part of the runner, not as a task — see "Failure mode and run lifecycle" below.

**Recap composition is not a task.** Recap is built at recap-time as a query over the activity log; dream pass produces the inputs (flags, summaries) but does not compose recap output itself. See "Recap composition" below.

### Output artifacts

| Task | Output |
|------|--------|
| 1, 2: Summarize threads | `ThreadSummary` rows; one `memory_change` per thread |
| 3: Expire standing instructions | `memory_change` per expired instruction; bound `AutoPolicy` cascade-expire per §06 |
| 4: `event` invalidation | `memory_change` per invalidated instruction; bound `AutoPolicy` cascade-expire per §06 |
| 4: `user_says` (interpretive) | `dream_pass_flag` per match, with `dedup_key` |
| 5: Passive signal flags | `dream_pass_flag` per signal match, with `dedup_key` |
| 6: Contradictions (advisory mode) | `dream_pass_flag` per structural contradiction |
| 7: Stale profile facts | `dream_pass_flag` per stale fact |
| 8: Oversize instruction count | One `dream_pass_flag` |
| Run meta | One `dream_pass_run` ActivityLogEntry, written at start with `status: 'running'` and updated at completion |

Every `dream_pass_flag` carries `details.dream_pass_run_id` and (where applicable) `details.dedup_key`. Every `memory_change` from dream pass carries `details.source: 'dream_pass'` and `details.dream_pass_run_id`.

### Recap composition

Recap is a **query at recap-time**, not a document the dream pass writes. The query:

- All `dream_pass_flag` entries from runs whose `dream_pass_run.created_at` (the run's start time, since the meta entry is written at pass start) is after the previous recap's `composed_at`. (Using the run's start time, not the flag's `created_at`, ensures a flag belongs to the run that produced it — protects against torn reads if a pass is mid-write when recap is composed.)
- All `auto_action` entries since the last recap, grouped by tool.
- All `event_silenced` entries since the last recap, grouped by trigger kind.
- `extension_status`-kind degraded-mode transition AppMessages since the last recap.
- Threads with `trigger.kind: 'stina'` created since the last recap.
- Open `dream_pass_flag` entries from prior runs whose `dedup_key` is still un-dismissed (so unresolved contradictions stay visible in recap as "still unresolved", once, until acted on).

**Pre-recap pass coordination.** When the pre-recap explicit trigger fires, the recap render holds for up to 60 seconds waiting for the pass to complete. If the pass finishes within 60s, recap composes with fresh artifacts. If the timeout hits, recap composes from data present and adds a `dream_pass_flag` of `kind: 'precap_pass_timeout'` inline so the user knows that night's pass didn't finish in time.

Decoupling recap from dream pass means a missed dream pass doesn't break recap (it just has less consolidated content) and a multi-pass night still produces a coherent recap.

### Waking threads

Dream pass does **not** mutate `Thread.status` directly. Two cases:

**Quiet → engagement via synthetic event.** Dream pass enqueues a synthetic event into the per-thread FIFO from §04 via `runtime.emitEventInternal`, with `trigger.kind: 'stina'`, `reason: 'dream_pass_insight'`, the originating `dream_pass_run_id`, and the `insight` text. The `AppContent.kind: 'system'` payload frames the insight for Stina. Stina's decision turn then runs over the insight + thread context. The decision-turn output determines whether the thread surfaces (per §04 lifecycle):

- If Stina judges the insight worth user attention → produces a `normal` message; thread surfaces normally; notification fires.
- If Stina judges it can stay background → `event_silenced`; thread stays background; flag still appears in recap.

A `dream_pass_flag` is also written referencing the thread. Until the synthetic event's decision turn runs, the thread stays in background per §04's pending-first-turn rule (since the new event is what re-engages it).

**Archived → forbidden.** Dream pass cannot un-archive threads. If dream pass identifies an insight relevant to an archived thread, it writes a `dream_pass_flag` that references the archived thread; the user can choose to un-archive from recap if they want. This protects an explicit user action ("I archived this for a reason") from being silently undone overnight.

### Safety controls

- **Dry-run mode.** Settings flag (default off). When on, the pass writes a `dream_pass_run` with `details.dry_run: true` and logs the *intended* changes (count by task, list of memory ids that would change, flag candidates) without writing them. **Scope of what dry-run catches**: cap violations, infinite-loop tasks, unhandled exceptions, and the *shape* of changes a pass would make. Dry-run does NOT validate the *correctness* of LLM judgments (whether a `user_says` flag is a true match, whether a contradiction is real). Semantic correctness requires human sampling — see Open questions.
- **Per-pass change cap** for *destructive* mutations (memory edits, expirations, summary regenerations). Default 50. `dream_pass_flag` entries do not count toward the cap; the pass should always be allowed to *report* what it found, even if it's blocked from changing things. On cap hit, the pass stops creating *more* mutations but tasks 4–8 (advisory flag generation) still run and the meta entry is still written. Recap then surfaces a `dream_pass_flag` of `kind: 'change_cap_hit'` so the user can raise the cap or investigate. If the user has a genuine backlog larger than the cap, raising the cap manually is the breakaway path.
- **Per-task transaction** — each task commits independently. A failure in task N doesn't roll back task N-1.
- **Provenance preserved** — every dream-pass-origin change carries `details.source: 'dream_pass'` and `details.dream_pass_run_id`.
- **Activity-log inspector exposes a "dream pass" filter.** The user can show only dream-pass-origin entries, or hide them. UI lives in §05; the data model already supports it.
- **Per-change undo** from the activity log inspector. There is no whole-pass rollback (per-change is more useful and avoids "did I undo the right thing").

### Failure mode and run lifecycle

The `dream_pass_run` entry has a status:

```ts
status: 'running' | 'paused' | 'completed' | 'crashed' | 'abandoned'
```

Lifecycle:

- **`running`** — written at pass start. Heartbeats updated periodically (once per task) so the recovery path can distinguish a true crash from a pause.
- **`paused`** — written when the pass yields between tasks (see Concurrency below). `paused_at` is set; heartbeat continues.
- **`completed`** — written when all tasks have finished or were skipped. `ended_at` set.
- **`crashed`** — set on next startup if a `running` entry has no recent heartbeat (≥ 5 minutes since last update) and no `paused_at`. Crashed passes do not retry automatically.
- **`abandoned`** — set if a `paused` pass exceeds the abandonment timeout (default 8 hours since `paused_at`) without resuming. A `dream_pass_flag` is written: *"Last consolidation pass was interrupted and abandoned; the next pass will start fresh."*

A pass marked `crashed` or `abandoned` does NOT block the next eligible pass beyond the normal cooldown.

### Concurrency: yielding, with hybrid resume

The pass does not hold a global lock. Instead:

- **Yielding between tasks.** Before starting each task, the pass checks whether any new items are queued in any per-thread FIFO (per §04 concurrency model) or any user activity has occurred. If yes, the pass writes a `paused` heartbeat and yields control.
- **Resume policy.** If the pass was paused < 8 hours ago and the next eligible idle window opens, the pass resumes the same `dream_pass_run` from the next task index. Tasks 1–2 (summarization) check `ThreadSummary.message_count_at_generation` before re-running, so resumption is naturally idempotent.
- **Abandonment.** If the pause exceeds 8 hours, the pass is marked `abandoned`. The next pass starts fresh as a new `dream_pass_run`. The user is told via a `dream_pass_flag`.
- **Memory writes** still go through the single-writer (per §03), so dream pass does not race with synchronous memory writes from active threads — the writer just serializes them.

This resolves the "dream-pass locking strategy" open question from §02.

### Cost / model selection

Dream pass uses an LLM for summarization and judgment tasks. By default, it uses the same provider Stina uses for live conversation. Settings can override to a separate provider for dream pass (e.g. cheaper local model when live conversation uses a paid one). This is purely a settings concern; no API change.

The runtime tracks token usage per pass in `dream_pass_run.details.usage`. The schema supports aggregate queries — settings can show a weekly/monthly cost summary (UI lives in §05) without requiring a schema change.

## Implementation checklist

- [ ] New `ActivityLogEntry.kind` values: `'dream_pass_run'`, `'dream_pass_flag'` (per §02)
- [ ] `dream_pass_run.details.status` field with values `'running' | 'paused' | 'completed' | 'crashed' | 'abandoned'`
- [ ] Memory writer asserts `created_by !== 'user'` for every dream-pass-origin mutation; failed assertion writes `dream_pass_flag { kind: 'rule_violation' }` and does not commit
- [ ] Trigger evaluator: idle ≥ 60 min AND in quiet hours AND cooldown elapsed (all configurable)
- [ ] Max-gap guarantee: if no pass in 48h (configurable), next ≥ 30 min idle window triggers regardless of quiet hours
- [ ] Explicit-trigger paths: pre-recap-time and user-demanded "Run now"
- [ ] First-install / sparse-data tasks short-circuit (only emit flags when there is something to flag)
- [ ] Task runner: each task runs in its own transaction; per-task failures recorded in meta entry without aborting the pass
- [ ] Tasks 1–2 fan out across the §04 cross-thread worker pool; tasks 3–8 are sequential
- [ ] Task 1: summarize threads that transitioned to `quiet`
- [ ] Task 2: re-summarize threads with materially new *user-meaningful* messages (silent dream-pass messages excluded from the threshold count)
- [ ] Task 3: expire standing instructions past `valid_until`; bound `AutoPolicy` records cascade-expire transactionally (cascade writer in §06)
- [ ] Task 4: evaluate `invalidate_on.event` (auto-invalidate) and `invalidate_on.user_says` (flag with confidence threshold ≥ 0.75 and `dedup_key`); `event`-invalidated instructions cascade to bound `AutoPolicy` records per §06
- [ ] Task 5: passive signal flags with `dedup_key`
- [ ] Task 6: structural contradiction detection (advisory mode); semantic similarity gated on §03 vocabulary/embeddings resolution
- [ ] Task 7: flag stale profile facts (default threshold 180 days)
- [ ] Task 8: flag oversize active-instruction count (default soft cap 30)
- [ ] Recap composition is a *query* at recap-time; query uses each `dream_pass_run` entry's `created_at` (the run start time, since the entry is written at pass start) as the cursor — not the flag's own `created_at`; query also includes still-un-dismissed flags from prior runs
- [ ] Pre-recap pass coordination: recap render holds up to 60s for the pass; on timeout, compose from data present and add `dream_pass_flag { kind: 'precap_pass_timeout' }`
- [ ] `dream_pass_flag` entries carry `details.dedup_key` where applicable; dismissed dedup keys are tombstoned and prevent re-flagging
- [ ] Provenance markers on every dream-pass-origin write: `dream_pass_flag` and `memory_change` entries carry `details.source: 'dream_pass'` and `details.dream_pass_run_id`, so inline rendering and the activity log inspector can surface dream-pass origin (hard rule: dream-pass changes are visually distinct)
- [ ] Waking threads: enqueue synthetic event in per-thread FIFO via `runtime.emitEventInternal` (trigger `stina` with `reason: 'dream_pass_insight'` + `dream_pass_run_id` + `insight`, content `system`); Stina's decision turn determines surfacing per §04. Dream pass never mutates `Thread.status` directly.
- [ ] Archived → active is forbidden in dream pass; flag in recap referencing the archived thread is the only mechanism
- [ ] Dry-run mode setting; pass logs intended changes without writing them; dry-run scope explicitly limited to shape/cap/exception detection (not semantic correctness)
- [ ] Per-pass change cap (default 50) applies to destructive mutations only; flag generation always allowed; cap hit produces `dream_pass_flag { kind: 'change_cap_hit' }`
- [ ] Activity log inspector exposes a "dream pass" filter (UI in §05)
- [ ] Per-change undo from the activity log inspector (no whole-pass rollback)
- [ ] Crashed-pass recovery: on startup, `dream_pass_run` with `status: 'running'` and stale heartbeat (≥ 5 min) is marked `crashed`; entries with `status: 'paused'` and `paused_at` within abandonment timeout are kept and resumable
- [ ] Abandonment: `paused` pass exceeding abandonment timeout (default 8 hours) is marked `abandoned`; user told via `dream_pass_flag`
- [ ] Yielding concurrency: pass checks queued thread-FIFO items / user activity between tasks and pauses; resumes same run if within 8h, otherwise next pass starts fresh
- [ ] Memory writes go through the existing single-writer (per §03)
- [ ] Settings: dream-pass provider override (defaults to Stina's live-conversation provider)
- [ ] Token usage tracked in `dream_pass_run.details.usage`; schema supports aggregate queries

## Open questions

- **Quiet-hours default for new users** — `02:00–05:00` is a guess. First-launch onboarding could ask, but that's setup friction. Alternative: detect quiet hours from observed inactivity over the trailing N days, both for new users and as ongoing adaptation.
- **Stale-fact threshold** — 180 days is a starting guess. Validate with usage; could be per-`predicate` (some facts decay faster than others — e.g. "current project" vs. "spouse's name").
- **Re-summarization threshold** — "5 new messages or 50% growth" is heuristic. Refine with real data.
- **`dream_pass_flag` state machine** — open / dismissed (and tombstoned) is enough for v1 via `dedup_key`. A richer state machine (acknowledged / snoozed-for-N-days / resolved) would let users defer-without-dismissing; worth considering once we have flag-volume data.
- **Long-running passes** — "abandon after 8h paused" is a starting heuristic. Validate; might want a separate "abandon if total elapsed exceeds X" guard for very fragmented runs.
- **Thread-summary quality measurement** — how do we know summaries are good? Sample for spec authors? User feedback signal? Related: dry-run validates shape, not semantic correctness — we need an evaluation harness for prompt iteration. Probably ships as a developer tool, not a v1 user feature.
- ~~**Provider override for dream pass**~~ — covered in §05 Inställningar → Modell.
- ~~**Token-cost aggregate UI**~~ — deferred to post-v1 per §05; schema (`dream_pass_run.details.usage`) supports it whenever it lands.
- **Abandonment notification severity** — should an `abandoned` pass produce a `medium`-severity flag or just a `low` background note? Probably depends on how often it actually happens.
