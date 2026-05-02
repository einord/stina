# 06 — Autonomy

> Status: **Stub**.

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

_To be written in full._

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

Topics to cover:

- Where severity is declared in tool/extension manifest (already in §02; this section will detail the install-time UX of surfacing it to the user)
- Policy creation flow: user-initiated vs. Stina-suggested
- Policy revocation: from settings, single click, no friction
- How a policy ties to a standing instruction (policy expires when its parent instruction does)
- Audit trail: every auto-action produces an activity log entry with the policy id
- What happens when a tool's severity changes after a policy exists (extension update)

## Implementation checklist

- [ ] Tool manifest declares `severity` (`low` | `medium` | `high` | `critical`); extension-declared value is authoritative in v1 (see §02)
- [ ] Per-extension settings view listing every tool, its declared severity, with per-tool override to a stricter level only (cannot lower below extension declaration)
- [ ] Extension registry surfaces verification hashes and tested / recommended / warned status to the user before install
- [ ] Auto-policy creation guard enforced per §02 (no silent policy creation in non-user-triggered threads)
- [ ] `critical`-severity tools are never auto-policied (enforced at policy-creation time)
- [ ] Collision-handling logic: when a standing instruction triggers a `high` action without a matching policy (or any `critical` action), Stina explicitly chooses Escalate / Skip / Solve differently
- [ ] `'action_blocked'` activity log entry written for every collision, recording intent + blocker + chosen alternative
- [ ] Schema and APIs do not preclude future Stina-core severity floor or `risk_class` enum (deferred hardening)

_Further items added as remaining design solidifies._

## Open questions

- **Severity upgrade path**: if extension v1 said `high` and v2 says `critical`, do existing policies for that tool get auto-revoked? (Probably yes, with notification.)
- **Per-context policies vs. per-tool**: discussion landed on per-context. Confirm we don't need a per-tool fallback.
- **Maximum policy count**: should there be a soft cap to prevent policy sprawl?
- **Policies created by Stina suggestion** vs. **user-initiated**: do we differentiate in the UI?
- **Trust progression triggers**: count-based ("after N times"), context-based ("when standing instruction Y is active"), or both?
- **Policy scope binding to trigger types**: should `PolicyScope` require explicit `trigger_kinds` (which trigger types can ever activate this policy), so a policy granted in a calendar context cannot accidentally fire on a mail event with a similar `match`? Leaning yes.

**Resolved (recorded in Design above):**
- ~~**Inform vs. silent default**~~ — `mode: 'silent'` is restricted to non-action entries (silenced events). Action policies (`auto_action`) always log to recap. See §02 ActivityLogEntry.
- ~~**Tool lock level authority**~~ — replaced by unified `severity` scale in §02; extension-declared in v1; floor mechanism deferred.
- ~~**Standing instruction vs. auto-policy collision**~~ — handled via Escalate / Skip / Solve differently (Stina chooses; choice recorded in `action_blocked` activity log entry). See Collision handling above.
