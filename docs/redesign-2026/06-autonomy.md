# 06 — Autonomy

> Status: **Draft**.

## Intent

Stina can act autonomously when the user trusts her to, but never in ways that surprise or harm. Three layers:

1. **Tool severity** (declared by the tool itself, drives both rendering and approval — see §02):
   - `low` — barely visible, executes silently
   - `medium` — visible but unobtrusive, executes without asking
   - `high` — prominently rendered; auto-executes if a policy exists, otherwise asks (or escalates)
   - `critical` — blocking prompt; never auto-policied
2. **Auto-policies** — per-context permissions for `high`-severity tools: "you may do X automatically as long as Y holds true". `critical` tools cannot be auto-policied.
3. **Progressive trust** — Stina notices repeated approvals and proposes a policy ("4th time you've approved this — make it automatic?")

Action policies always log to recap (`inform` mode). The `silent` value exists only for non-action entries (events Stina chose not to act on, internal reasoning). See §02 `AutoPolicy` constraint and §02 `ActivityLogEntry`.

## Design

### v1 trust model for tool severity (decided)

In v1, the tool's declared `severity` (set by the extension that owns the tool) is authoritative. Stina core does not override extension-declared severity downward.

The user's safety net in v1 is the combination of:

1. **Per-extension settings view** — a UI where the user sees every tool an extension exposes, its declared severity, and can override individual tools to a *stricter* level (e.g. mark a `medium` tool as `critical`). Severity cannot be lowered below the extension's declaration.
2. **Extension registry** — curated list with verification hashes; extensions can be marked tested / recommended / warned. The registry is the front line for catching malicious or careless extensions before they're installed.
3. **Auto-policy creation guard** in §02 — events from non-user triggers cannot lead to silent autonomous policies without an interactive user approval step.

### Collision handling (decided)

A standing instruction expresses **intent** ("reply to weekend work mail saying I'm away"). An auto-policy grants **permission** ("you may invoke the send-mail tool automatically when this instruction matches"). Both are required for silent execution of a `high`-severity action. A standing instruction alone does not authorize bypassing approval — the user must consciously create the policy.

When Stina is in a non-user-triggered thread and an active standing instruction wants her to invoke a tool whose severity exceeds what's currently authorized (no matching policy for `high`, or any `critical` action), she has three options. She must choose explicitly — silent failure is forbidden.

| Option | Behavior | When to use |
|--------|----------|-------------|
| **Escalate** | Publicize the thread, notify the user, ask for confirmation | The action is time-sensitive or the instruction was strongly worded; user-visible thread is acceptable |
| **Skip** | Take no action this time. Log `'action_blocked'` with the intent and reasoning | The instruction permits judgment ("if you think it's appropriate"); the cost of not acting is low |
| **Solve differently** | Use a lower-severity alternative (save draft instead of send; schedule for later when user is back; mark-as-read instead of reply) | An alternative tool exists and serves the user's underlying goal acceptably |

Stina selects based on context: instruction wording, urgency signals, available alternatives, and the user's history of preferred handling. The choice is recorded in the `'action_blocked'` activity log entry so the user sees in recap *what Stina wanted to do, why she couldn't, and what she did instead*.

**Recap example:** *"You got three work mails over the weekend. I auto-replied to two per your away-message instruction. The third needed your confirmation to send — I didn't want to interrupt you, so I saved a draft. Want to look at it now?"*

### Future hardening (deferred)

As the user base grows, the v1 trust model becomes weaker (more attack surface, more careless extensions, less personal review per install). Two mechanisms to consider when that day comes:

- **Stina-core severity floor**: categories like `delete:permanent`, `send:network`, `payment` are *always* `critical`, regardless of extension declaration. Extensions can raise severity but never lower it below the floor for their permission scope.
- **`risk_class` enum in extension manifest**: validated at install time, surfaced to the user, with severity *derived* from `(risk_class, user policy)` instead of declared freely.

These are not in v1, but the schema and APIs introduced in v1 must not preclude them.

### Severity at install time

When a user installs an extension, the install dialog surfaces what they're consenting to. Per-tool severity is the most important signal because it directly affects what Stina may do without asking.

The install dialog shows:

- Extension name, version, registry status (tested / recommended / warned / unknown)
- The full list of tools the extension exposes, each with its declared severity badge
- A summary line: *"This extension exposes 3 `low`, 2 `medium`, 1 `high` tools, and 0 `critical` tools."*
- Particular emphasis on `high` and `critical` tools — they are listed first with a short description of what each does
- An expandable "About permissions" section explaining the severity scale to first-time installers

Installing the extension is acceptance of the declared severities. After install, the user can override any individual tool to a *stricter* level via the per-extension settings view; downgrading is forbidden.

If the registry status is `warned` or `unknown`, the install dialog adds a friction step: the user must explicitly check "I understand this extension is not verified" before the install button is enabled.

### Policy creation flow

There are two paths to creating an `AutoPolicy`. Both produce the same record; the `created_by_suggestion: boolean` flag on `AutoPolicy` records which path was used.

**User-initiated.** The user opens settings → autonomy → "Create new policy", picks a tool, picks a scope (typically binding to an existing standing instruction via `scope.standing_instruction_id`), and confirms. The policy is active immediately.

**Stina-suggested.** Stina notices a pattern that suggests autonomy is wanted, and proposes a policy. Two surfaces:

1. **Inline in a thread** — after the user has approved the same tool with the same scope a configurable number of times (default 4): *"I notice you've approved this 4 times this week — make it automatic going forward?"* The user clicks accept, edits, or dismisses. Acceptance creates the policy.
2. **In the recap** — Stina aggregates "I had to ask you N times this week about X" patterns and proposes a policy in the morning briefing. Same accept / edit / dismiss affordances.

Per the §02 auto-policy creation guard, suggestions made *inside* a non-user-triggered thread cannot create the policy from inside that thread alone — the user must accept either after engaging the thread (which constitutes interactive approval) or from the recap surface (which is also interactive). This means an autonomous mail thread cannot escalate itself into permanent autonomy without the user being a conscious actor.

### Policy revocation

Policies are revocable at all times with no friction:

- Settings → autonomy → list of active policies, sorted by most-recently-created
- Each row shows: the tool, a one-line scope summary, the parent standing instruction (clickable, if bound), the source thread where it was created, the `approval_count` and `created_by_suggestion` provenance, and a `[Revoke]` button
- One click revokes; the revocation is logged as a `memory_change` activity log entry with the previous policy in `details.previous`
- If Stina is mid-turn in any thread where the policy was about to be applied, she falls back to the §06 collision-handling logic (Escalate / Skip / Solve differently) for that turn
- A revoked policy can be recreated from the activity log inspector with one click ("Recreate this policy"), which is useful if the user revokes by accident

There is no "soft revoke" or "snooze" in v1 — revoke is binary and immediate. If users want temporal pauses, the right primitive is a standing instruction with `valid_until` (the parent instruction expires, the bound policy expires with it).

### Policy ↔ standing instruction lifecycle

A policy bound to a standing instruction (`scope.standing_instruction_id` set) lives only as long as the parent instruction. When the parent is removed for *any* reason, the bound policy is automatically removed in the same operation:

- Instruction expires (`valid_until` reached, evaluated by dream pass per §07) → bound policies expire
- Instruction is invalidated (`event` match in §07) → bound policies expire
- Instruction is invalidated by user confirmation of a `user_says` flag → bound policies expire
- Instruction is deleted by user from settings → bound policies expire

Each cascading expiration produces its own `memory_change` activity log entry with a `details.cascaded_from` field. The field is a tagged union covering the three cases that actually occur:

```ts
details.cascaded_from:
  | { kind: 'log_entry';            entry_id: string }                                              // parent log entry (instruction expiration / invalidation / deletion)
  | { kind: 'severity_change';      tool_id: string; from: ToolSeverity; to: ToolSeverity }         // tool became un-policy-able
  | { kind: 'extension_uninstall';  extension_id: string }                                          // extension removed; bound policies wiped
```

For lifecycle cascades (instruction expiration), `kind: 'log_entry'`. For severity-change cascades (covered below), `kind: 'severity_change'`. Either way, the audit trail is self-explanatory ("why did this policy disappear?") without requiring the user to chain queries themselves.

Policies *not* bound to a standing instruction (free-standing — `scope.standing_instruction_id` is `undefined`) live until explicitly revoked. These are rarer in practice — most autonomy lives in the context of a rule.

### Audit trail

Every auto-action produces an `auto_action` ActivityLogEntry with structured `details`:

```ts
details: {
  tool_id: string                // which tool ran
  policy_id: string              // which policy authorized this
  standing_instruction_id?: string  // the parent instruction (if bound)
  action_summary: string         // human-readable, e.g. "Sent reply to Peter (Q2 plan)"
  tool_input: Record<string, unknown>   // sanitized — see below
  tool_output?: Record<string, unknown> // sanitized, optional
  duration_ms: number
}
```

**Sanitization.** `tool_input` and `tool_output` go through a per-tool redactor declared in the tool manifest, which removes secrets (API tokens, passwords) and large blobs (file contents, attachment bytes). The redactor is part of the tool's contract; if it does not exist, the inputs/outputs are stored as `[redacted: no redactor declared]` and the activity log entry is flagged for review.

**Traceability chain.** From any `auto_action` entry the user can trace:

```
auto_action → AutoPolicy (policy_id) → StandingInstruction (standing_instruction_id) → source thread (StandingInstruction.source_thread_id)
```

Every step is one click in the activity log inspector. "Why did Stina send this mail?" has a deterministic answer.

### Severity changes after a policy exists

When an extension update changes a tool's declared severity, existing policies for that tool may become inconsistent. The runtime handles each case:

| Change | Effect on existing policies |
|--------|----------------------------|
| `low / medium` → `high` (severity raised, still policy-able) | Policies remain valid; rendering updates to the higher severity. User is notified via `extension_status` AppMessage with `status: 'severity_changed'`. |
| `high` → `critical` (severity raised past the policy-able threshold) | All existing policies for that tool are auto-revoked (with `memory_change` entries for each, `details.cascaded_from: { kind: 'severity_change', tool_id, from: 'high', to: 'critical' }`). User is notified prominently via an `extension_status` AppMessage with `status: 'severity_changed'` in a Stina-triggered thread: *"Extension X marked tool Y as critical — N existing policies have been revoked. Bound standing instructions remain active but will now require your confirmation."* The bound standing instructions are NOT removed — the *intent* is still valid; only the silent execution is now forbidden. |
| `high / critical` → `low / medium` (severity lowered, still in extension-declared range) | Existing policies are over-specified but harmless; they remain. New approvals for the tool may stop triggering policy suggestions, since `low / medium` doesn't need them. No notification. |
| Severity change combined with extension uninstall | Existing policies are auto-revoked as part of the uninstall (`details.cascaded_from: { kind: 'extension_uninstall', extension_id }`); standing instructions referencing the extension's tools are flagged in the next dream pass for user review. |

The runtime processes severity changes during extension load. The `memory_change` cascade and any user notification are written transactionally with the manifest update — partially-applied state is not possible.

A user override (per-extension settings view, marking a tool as `critical`) follows the same logic as an extension-declared raise: existing policies for the now-critical tool are auto-revoked.

## Implementation checklist

- [ ] Tool manifest declares `severity` (`low` | `medium` | `high` | `critical`); extension-declared value is authoritative in v1 (see §02)
- [ ] Tool manifest declares a per-tool input/output redactor for activity-log sanitization; missing redactor → `[redacted: no redactor declared]` and the entry is flagged
- [ ] Install dialog surfaces every tool's severity, registry status, and (for `warned` / `unknown` registry status) requires an explicit "I understand" confirmation before enabling install
- [ ] Per-extension settings view listing every tool, its declared severity, with per-tool override to a stricter level only (cannot lower below extension declaration)
- [ ] Extension registry surfaces verification hashes and tested / recommended / warned status to the user before install
- [ ] Auto-policy creation guard enforced per §02 (no silent policy creation in non-user-triggered threads)
- [ ] `critical`-severity tools are never auto-policied (enforced at policy-creation time)
- [ ] Policy creation flow: user-initiated path from settings, plus Stina-suggested path (inline in thread after configurable approval count, or in recap)
- [ ] `AutoPolicy.created_by_suggestion: boolean` distinguishes the two creation paths (per §02)
- [ ] Policy revocation from settings: one-click; logged as `memory_change` with `details.previous`; recreatable from activity log inspector
- [ ] Policy lifecycle bound to standing instruction: cascading auto-revoke when parent expires / invalidates / is deleted; cascade entries reference triggering entry via `details.cascaded_from`
- [ ] Audit trail: every `auto_action` ActivityLogEntry carries `tool_id`, `policy_id`, `standing_instruction_id` (if bound), `action_summary`, sanitized `tool_input` / `tool_output`, `duration_ms`
- [ ] Activity log inspector supports the traceability chain: `auto_action → AutoPolicy → StandingInstruction → source thread` in single-click steps
- [ ] Severity raised to `critical` (or user override raises to `critical`): all existing policies for that tool auto-revoked transactionally with the manifest update; user notified via `extension_status` AppMessage in a Stina-triggered thread
- [ ] Severity raised within policy-able range (`low/medium → high`): policies remain valid, user notified via `extension_status` AppMessage
- [ ] Severity lowered: existing policies remain valid; new approvals may stop triggering policy suggestions; no notification
- [ ] Extension uninstall: bound policies auto-revoked; bound standing instructions flagged in next dream pass for user review
- [ ] Collision-handling logic: when a standing instruction triggers a `high` action without a matching policy (or any `critical` action), Stina explicitly chooses Escalate / Skip / Solve differently
- [ ] `'action_blocked'` activity log entry written for every collision, recording intent + blocker + chosen alternative
- [ ] `PolicyScope.trigger_kinds?: ThreadTrigger['kind'][]` field; if set, the policy only fires for matching trigger kinds (defaults to "any" if undefined)
- [ ] Schema and APIs do not preclude future Stina-core severity floor or `risk_class` enum (deferred hardening)

## Open questions

- **Maximum policy count**: should there be a soft cap to prevent policy sprawl? Dream pass already flags oversize standing-instruction count (§07); a parallel signal for policies makes sense, but the threshold is unknown without usage data. Leaning: same approach (soft cap, dream-pass flag in recap, no hard limit).
- **Trust progression triggers**: count-based ("after N times") is the v1 default in the design. Context-based ("when standing instruction Y is active") is a more nuanced signal. v1 ships count-based; revisit if patterns emerge.
- **Default approval-count threshold for Stina-suggested policies**: 4 is a starting guess. Validate with usage; could be per-severity (suggest sooner for `medium`, slower for `high`).
- **Redactor for tools without a declared one**: today the spec says missing redactor → `[redacted: no redactor declared]` and entry is flagged. Should the runtime *refuse* the tool entirely until a redactor is declared, or accept the safe default? Leaning the latter for v1 (tool still works, audit trail is just less rich), but worth reconsidering as the registry tightens.
- **`extension_status` notification handling for severity changes**: the design fires an AppMessage with `status: 'severity_changed'` in a Stina-triggered thread. Should this thread always surface (notify), or follow the normal decision-turn rules? The user really should know about silent policy revocations — leaning always-surface for `critical` raises and revocation cascades, normal lifecycle for benign changes.

**Resolved (recorded in Design above):**
- ~~**Inform vs. silent default**~~ — `mode: 'silent'` is restricted to non-action entries (silenced events). Action policies (`auto_action`) always log to recap. See §02 ActivityLogEntry.
- ~~**Tool lock level authority**~~ — replaced by unified `severity` scale in §02; extension-declared in v1; floor mechanism deferred.
- ~~**Standing instruction vs. auto-policy collision**~~ — handled via Escalate / Skip / Solve differently (Stina chooses; choice recorded in `action_blocked` activity log entry). See Collision handling above.
- ~~**Severity upgrade path**~~ — handled per the "Severity changes after a policy exists" table: raised to `critical` auto-revokes existing policies with notification; other raises preserve policies with notification; lowering preserves policies silently.
- ~~**Per-context policies vs. per-tool**~~ — confirmed per-context (policies bind to scope, optionally to a standing instruction). No per-tool fallback needed; a "use this tool freely" effect is achievable by lowering severity declaration if the extension owner agrees.
- ~~**Stina-suggested vs. user-initiated policies in the UI**~~ — recorded via `AutoPolicy.created_by_suggestion: boolean`; the settings list surfaces the provenance per row. No different *behavior* between the two; just visible provenance.
- ~~**Policy scope binding to trigger types**~~ — `PolicyScope.trigger_kinds?: ThreadTrigger['kind'][]` is included; if set, the policy only fires for matching trigger kinds. Defaults to "any" when undefined, which keeps the simple case simple.
