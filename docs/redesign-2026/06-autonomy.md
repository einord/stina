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

Two action modes: `silent` (do, no notification) and `inform` (do, surface in recap). `inform` is the safer default.

## Design

_To be written._

Topics to cover:

- Where lock level is declared in tool/extension manifest
- Policy creation flow: user-initiated vs. Stina-suggested
- Policy revocation: from settings, single click, no friction
- How a policy ties to a standing instruction (policy expires when its parent instruction does)
- Audit trail: every auto-action produces an activity log entry with the policy id
- What happens when a tool's lock level changes after a policy exists (extension update)

## Implementation checklist

_Filled in as design solidifies._

## Open questions

- **Lock level upgrade path**: if extension v1 said `policy` and v2 says `always-ask`, do existing policies for that tool get auto-revoked? (Probably yes, with notification.)
- **Per-context policies vs. per-tool**: discussion landed on per-context. Confirm we don't need a per-tool fallback.
- **Maximum policy count**: should there be a soft cap to prevent policy sprawl?
- **Policies created by Stina suggestion** vs. **user-initiated**: do we differentiate in the UI?
- **Inform vs. silent default**: spec leans `inform` as default. Confirm and document.
- **Trust progression triggers**: count-based ("after N times"), context-based ("when standing instruction Y is active"), or both?
