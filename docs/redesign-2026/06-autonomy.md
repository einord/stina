# 06 — Autonomy

> Status: **Stub**.

## Intent

Stina can act autonomously when the user trusts her to, but never in ways that surprise or harm. Three layers:

1. **Tool lock levels** (deterministic, declared by the tool itself):
   - `always-ask` — never auto-approved (deletion, sending mail to unknown recipients, payments)
   - `policy` — follows auto-policy if one exists, otherwise asks
   - `free` — never asks (read-only operations)
2. **Auto-policies** — per-context permissions: "you may do X automatically as long as Y holds true"
3. **Progressive trust** — Stina notices repeated approvals and proposes a policy ("4th time you've approved this — make it automatic?")

Action policies always log to recap (`inform` mode). The `silent` value exists only for non-action entries (events Stina chose not to act on, internal reasoning). See §02 `AutoPolicy` constraint and §02 `ActivityLogEntry`.

## Design

_To be written in full._

### v1 trust model for tool lock levels (decided)

In v1, the tool's declared `lock` level (set by the extension that owns the tool) is authoritative. Stina core does not override extension-declared lock levels.

The user's safety net in v1 is the combination of:

1. **Per-extension settings view** — a UI where the user sees every tool an extension exposes, its declared lock level, and can override individual tools to a stricter level (`always-ask`).
2. **Extension registry** — curated list with verification hashes; extensions can be marked tested / recommended / warned. The registry is the front line for catching malicious or careless extensions before they're installed.
3. **Auto-policy creation guard** in §02 — events from non-user triggers cannot lead to silent autonomous policies without an interactive user approval step.

### Future hardening (deferred)

As the user base grows, the v1 trust model becomes weaker (more attack surface, more careless extensions, less personal review per install). Two mechanisms to consider when that day comes:

- **Stina-core floor list**: categories like `delete:permanent`, `send:network`, `payment` are *always* `always-ask`, regardless of extension declaration. Extensions can raise friction but never lower it below the floor for their permission scope.
- **`risk_class` enum in extension manifest**: validated at install time, surfaced to the user, with lock level *derived* from `(risk_class, user policy)` instead of declared freely.

These are not in v1, but the schema and APIs introduced in v1 must not preclude them.

Topics to cover:

- Where lock level is declared in tool/extension manifest
- Policy creation flow: user-initiated vs. Stina-suggested
- Policy revocation: from settings, single click, no friction
- How a policy ties to a standing instruction (policy expires when its parent instruction does)
- Audit trail: every auto-action produces an activity log entry with the policy id
- What happens when a tool's lock level changes after a policy exists (extension update)

## Implementation checklist

- [ ] Tool manifest declares `lock` level (`always-ask` | `policy` | `free`); extension-declared value is authoritative in v1
- [ ] Per-extension settings view listing every tool, its declared lock level, with per-tool override to a stricter level (`always-ask`)
- [ ] Extension registry surfaces verification hashes and tested / recommended / warned status to the user before install
- [ ] Auto-policy creation guard enforced per §02 (no silent policy creation in non-user-triggered threads)
- [ ] Schema and APIs do not preclude future Stina-core floor list or `risk_class` enum (deferred hardening)

_Further items added as remaining design solidifies._

## Open questions

- **Lock level upgrade path**: if extension v1 said `policy` and v2 says `always-ask`, do existing policies for that tool get auto-revoked? (Probably yes, with notification.)
- **Per-context policies vs. per-tool**: discussion landed on per-context. Confirm we don't need a per-tool fallback.
- **Maximum policy count**: should there be a soft cap to prevent policy sprawl?
- **Policies created by Stina suggestion** vs. **user-initiated**: do we differentiate in the UI?
- **Trust progression triggers**: count-based ("after N times"), context-based ("when standing instruction Y is active"), or both?
- **Policy scope binding to trigger types**: should `PolicyScope` require explicit `trigger_kinds` (which trigger types can ever activate this policy), so a policy granted in a calendar context cannot accidentally fire on a mail event with a similar `match`? Leaning yes.

**Resolved (recorded in Design above):**
- ~~**Inform vs. silent default**~~ — `mode: 'silent'` is restricted to non-action entries (silenced events). Action policies (`auto_action`) always log to recap. See §02 ActivityLogEntry.
- ~~**Tool lock level authority**~~ — extension-declared in v1; floor mechanism deferred.
