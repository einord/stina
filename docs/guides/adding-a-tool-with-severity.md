# Adding a Tool with Severity

Severity is a four-level scale (`low` | `medium` | `high` | `critical`) that simultaneously drives how tool calls render in the UI (§05 visual weight) and whether the model may invoke a tool automatically (§06 autopolicy gate). Getting the declaration right is the first thing to nail when adding any tool that can change state, read sensitive data, or perform work on the user's behalf.

This guide assumes you already know how to register a tool from [docs/guides/adding-builtin-tool.md](./adding-builtin-tool.md). It focuses entirely on the severity declaration, the runtime gate behavior, and the footguns specific to extension-registered tools.

## The four severity levels

| Level | Runtime behavior | Visual (§05) |
|-------|-----------------|--------------|
| `low` | Executes immediately. No approval needed. | Quiet grey |
| `medium` | Executes immediately. No approval needed. **Default if severity is not declared.** | Baseline |
| `high` | Requires an active `AutoPolicy` for the tool — Stina cannot run it automatically without one. Fail-safe blocks when no policy callback is wired or no matching policy exists. | Accent border-left + warm background |
| `critical` | **Always blocked from automatic execution** in v1. Critical tools cannot be autopolicied regardless of any policy the user creates. | Full rose border + heavier background |

### Hallucinated tool names

When the model emits a tool name that is not in your registered set, the orchestrator labels it `'high'` for stream-event rendering and **always blocks** it with reason `'hallucinated_tool'`. That block runs before any policy lookup — wiring a matching policy does not unblock a hallucinated name.

## Where to declare severity

**This is the most important section.** There are two places a severity field could live in your code, and only one of them actually works for extension-registered tools.

### Extension-registered tools: manifest only

Declare `severity` in the `contributes.tools[].severity` field of your `manifest.json`:

```json
{
  "id": "my-extension",
  "contributes": {
    "tools": [
      {
        "id": "my_high_severity_tool",
        "name": "My High-Severity Tool",
        "description": "Does something sensitive that requires a policy.",
        "severity": "high",
        "requiresConfirmation": false
      },
      {
        "id": "my_medium_severity_tool",
        "name": "My Medium-Severity Tool",
        "description": "Reads local state — executes without a policy.",
        "severity": "medium",
        "requiresConfirmation": false
      }
    ]
  }
}
```

This is the exact pattern from `packages/dev-test-extension/manifest.json` (lines 22–34), the canonical worked example.

**Why not `ctx.tools.register({severity: ...})`?** The `ToolDefinition` TypeScript type that `ctx.tools.register()` accepts does include a `severity?` field, so passing it compiles. However, the value is **silently dropped at the worker IPC boundary** — the registration message put on the wire only carries `id`, `name`, `description`, and `parameters`. When the host receives the registration, it looks up severity from `extension.manifest.contributes.tools[i].severity` (matched on `id`) and attaches that value to the adapted tool. The manifest is the only path.

```typescript
// In src/index.ts — note: no severity in the runtime payload.
// Severity is resolved from manifest.json at load time, not from here.

const highSeverityDisposable = ctx.tools.register({
  id: 'dev_test_high_severity_action',
  name: 'Dev Test: High-Severity Action',
  description: 'Fake high-severity tool for testing the §06 policy gate. Always succeeds.',
  async execute(_params) {
    return {
      success: true,
      data: { message: 'DEV tool executed — policy gate passed ✓' },
    }
  },
})

const emitMailDisposable = ctx.tools.register({
  id: 'dev_test_emit_test_mail',
  name: 'Dev Test: Emit Test Mail',
  description: 'Emits a synthetic mail event, spawning a new mail-triggered thread.',
  async execute(_params) {
    // ...
  },
})
```

Neither call passes `severity`. Both tools get their severity from the manifest above.

### Built-in tools: runtime field, no manifest

Built-in tools (those living in `packages/builtin-tools/`) have no manifest and cross no IPC boundary. They declare severity directly on the `ToolDefinition` object returned from the factory function. See [docs/guides/adding-builtin-tool.md](./adding-builtin-tool.md) for that path.

## `severity` vs. `requiresConfirmation`

These are two different axes and they operate in different flows.

**`severity`** controls automatic-execution gating in the redesign-2026 inbox / decision-turn flow (the §06 autopolicy machinery). It is the only gate that matters for tools invoked through inbox threads.

**`requiresConfirmation`** is a field from the legacy chat-tool flow. It is recorded onto the adapted tool from the manifest and defaults to `true` when omitted, but the redesign-2026 producer does not read it. For tools invoked via the inbox / decision-turn path, `requiresConfirmation` is effectively a no-op — it does not substitute for severity gating and it does not block automatic execution. The field is still present on the adapted tool, so any legacy chat-tool routing your extension may receive (see [Adding a Built-in Tool](./adding-builtin-tool.md)) continues to honor it; for the new flow, design as if `severity` is the only gate.

The dev-test extension's tools both declare `"requiresConfirmation": false` precisely to signal that `requiresConfirmation` is not the safety mechanism here — `severity` is.

For the legacy chat-tool flow where `requiresConfirmation` still has effect, see [docs/guides/adding-builtin-tool.md](./adding-builtin-tool.md).

## How to choose severity

When in doubt, declare higher. Users can reduce friction by creating a policy; they cannot undo silent execution after the fact.

- **Pure reads of public or non-sensitive data** → `'low'`.
- **Local-only side effects** (drafts, local marks, search results saved locally) → `'medium'`.
- **Reads of broadly sensitive data** (full mailbox contents, contact list, files) → `'medium'`; escalate to `'high'` if exfiltration or leak risk on the tool output is meaningful.
- **Side effects observable to others** (send mail, post a message, payment, public state change) → `'high'`.
- **Irreversible destruction, money movement, or large network disclosure** (permanent delete, unrecoverable state change) → `'critical'`. Note this is authoring guidance, not a v1 gate — none of these scopes are mechanically forced to `'critical'` today; future hardening discussed in §06 might.

## Authoring a high-severity tool — checklist

1. **Manifest**: declare `"severity": "high"` and `"requiresConfirmation": false` in `contributes.tools[]`.
2. **Implementation**: register the tool via `ctx.tools.register({...})` in `activate()`. Do not pass `severity` in the runtime payload — it will be dropped.
3. **Document the policy requirement**: the user must create an `AutoPolicy` from the "Autonomi" sidebar before Stina can call the tool automatically. Without a policy the tool is blocked on every call. Document this in your extension's README so users know what to do after install.
4. **Plan for irreversibility**: once the user grants a policy, Stina can call the tool silently during any decision turn. Design `execute` as if it will fire without any further user interaction.

## Authoring a critical-severity tool

Declare `"severity": "critical"` in `manifest.json`. Stina **cannot ever** automatically invoke a critical tool in v1 — the gate hard-blocks unconditionally. A critical tool today is effectively a "manual only" surface.

The user-confirmation modal flow for critical tools is not yet shipped. If you need a tool that Stina should be able to attempt to call but that the user must approve every time, use `high` severity and do not suggest a policy.

**Forward-compat note (under consideration, not committed):** §06 lists future hardening options — a Stina-core severity floor that would force certain permission scopes (such as `delete:permanent`, `send:network`, and `payment`) to a higher severity regardless of what the extension declares, and possibly a `risk_class` enum derived from the scope and user policy. Neither is in v1 and the exact mechanism remains open. Declaring `'low'` for a destructive tool and assuming it will stay that way is the kind of bet that creates a bad surprise when those mechanisms land. Conservative authoring beats a v2 regression.

## Activity-log entries: what gets written

The "Aktivitetslogg" view (reachable from `MainNavigation` → "Aktivitetslogg") shows an entry for every gated tool call:

- **`low` or `medium` auto-execute** — no `auto_action` or `action_blocked` entry is written; only the normal stream-event trace. The observable confirmation that severity took effect is the `severity-low` / `severity-medium` CSS class on the `tool_call` row in the streaming card and persisted message — not an activity-log row.
- **`high` + policy authorizes** — `auto_action` entry with `tool_id`, `tool_input`, `tool_output`, `policy_id`, and `flagged_for_review` (see the redactor section below for when that flag is true).
- **`high` + no matching policy** — `action_blocked` entry with `chosen_alternative: 'skip'` and `reason: 'no_matching_policy'`.
- **`critical`** — `action_blocked` entry with `reason: 'critical_severity'`.
- **Hallucinated tool name** — `action_blocked` entry with `reason: 'hallucinated_tool'`. The entry's `severity` field is recorded as `'high'` — that is the rendering label the orchestrator assigned, not a value declared by any extension.

`chosen_alternative: 'skip'` is the only wired v1 collision option. Escalate and Solve-differently are v2.

## Per-tool redactor (v1 limitation)

A redactor sanitizes `tool_input` and `tool_output` before they land in the `auto_action` activity-log entry. The redactor interface is:

```typescript
(io: { tool_input: Record<string, unknown>; tool_output?: Record<string, unknown> }) => {
  tool_input: Record<string, unknown>
  tool_output?: Record<string, unknown>
}
```

**Extension-registered tools cannot supply a redactor in v1**, because function references cannot cross the worker IPC boundary. The manifest schema (`packages/extension-api/src/schemas/contributions.schema.ts`) deliberately omits a `redactor` field — adding it there would have no effect and would be misleading. The host falls back to the sentinel string `[redacted: no redactor declared]` and sets `flagged_for_review: true` on the activity-log entry for every extension-registered tool whose call is auto-approved.

Closing the IPC redactor gap is a tracked stina-side step. Until it lands, design tools whose I/O contains sensitive data with the assumption that the auto-policy `auto_action` log will carry a redacted sentinel for those fields.

Built-in tools defined inside `packages/builtin-tools/` can declare a redactor today, since they run on the same side of the IPC boundary as the host.

## Verifying the gate end-to-end

### Preconditions

The severity gate only fires when Stina actually invokes tools. Two things must be true:

1. **An AI provider extension installed, configured as the user's default model, AND currently registered in the running host.** `apps/api/src/redesignProvider.ts` falls back to the canned stub in three distinct cases: no `defaultId` set in user settings, no `ModelConfig` found for that ID, or the provider extension is selected but is not currently loaded in the host (extension errored at activation, host not yet ready, race at boot, etc.). The canned stub never emits `tool_start` and therefore never exercises the gate. If you installed your AI provider extension but still see no tool calls, check that the host actually loaded it — a failed activation is a common cause. `stina-ext-ollama` against a local model that is willing to call tools is the simplest working setup.

2. **Your extension installed via `install-extensions.sh` and visible in the running app.** See below.

### Build and install

```sh
pnpm build                                                  # in your extension repo
../dev-tools/install-extensions.sh my-extension            # path is relative to the stina/ workspace root
```

### Boot the dev server

```sh
DB_PATH=/tmp/stina-demo.db pnpm dev:seed typical-morning --fresh
DB_PATH=/tmp/stina-demo.db STINA_MASTER_SECRET=dev pnpm dev:web
```

### Test `medium` severity

Open a thread and ask Stina to call your medium-severity tool. The tool executes. The `tool_call` row in the streaming card (and on the persisted message after `done`) renders with `severity-medium` styling — that visual weight, not the tool's side effect, is the signal that severity is correctly wired.

### Test `high` without a policy

Ask Stina to call your high-severity tool before creating a policy. The streaming card shows a blocked row with reason `no_matching_policy`. "Aktivitetslogg" shows an `action_blocked` entry with `reason: 'no_matching_policy'`.

### Test `high` with a policy

Open "Autonomi" in the sidebar → "Skapa policy" → pick your tool → confirm. Ask Stina again. The tool executes. The activity log shows an `auto_action` entry. For extension-registered tools the I/O fields show `[redacted: no redactor declared]` and `flagged_for_review` is `true` (see §8 above).

### Test `critical`

The gate blocks regardless of any policy you create. The streaming card shows a blocked row; the activity log shows `action_blocked` with `reason: 'critical_severity'`. Policies for `'critical'` tools are rejected at policy-creation time.

## Common footguns

**Forgetting to declare severity in the manifest** — the tool defaults to `'medium'` and executes silently. If you intended `'high'`, you have created a footgun for your users: there is no approval step and no warning.

**Declaring severity only in `ctx.tools.register({severity: ...})`** — the runtime value is silently dropped at the worker IPC boundary. The registration message on the wire only carries `id`, `name`, `description`, and `parameters`. The manifest is the only source of truth for extension-registered tools.

**Assuming `requiresConfirmation: true` substitutes for severity gating** — in the redesign-2026 inbox / decision-turn flow the producer ignores `requiresConfirmation`. Severity is the only gate. A high-severity tool with no policy still blocks even if `requiresConfirmation` is `true`.

**Designing a tool that writes irreversible state but declaring it `'low'` or `'medium'`** — once the gate authorizes low/medium calls, there is no second-chance prompt. Severity is the only safety net.

**Forgetting to document the policy creation path for `high` tools** — the tool is effectively dead until the user finds the "Autonomi" sidebar. This should be in your extension's README.

**Adding a `redactor` function to `ctx.tools.register({redactor: ...})`** — this is silently dropped because functions cannot cross IPC. The tool falls into the no-redactor branch on the host side. Do not wire a redactor in extension `activate()` in v1.

**Leaning on the absence of a severity floor** — §06 describes future hardening options (Stina-core severity floor, `risk_class` enum) that may force higher severity for destructive scopes. Neither is in v1 and neither is committed. Conservative declaration today avoids the surprise if and when those mechanisms land.

## Reference: the canonical worked examples

`packages/dev-test-extension/manifest.json` — high + medium tool declarations at lines 22–34.

`packages/dev-test-extension/src/index.ts` lines 88–115 — the matching `ctx.tools.register()` calls. Neither call passes `severity` in the runtime payload: severity is resolved exclusively from the manifest.
