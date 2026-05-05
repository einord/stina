---
name: redesign-step
description: Drive one redesign-2026 implementation step end-to-end using a team of sub-agents (critic before code, implementer, reviewer after). Use when the user wants to advance the redesign-2026 work — typical triggers are "/redesign-step", "kör nästa redesign-steg", "fortsätt på redesign-2026", "next redesign step", or similar. The skill enforces quality gates that fresh sessions tend to skip: spec re-read, design critique before code, post-implementation review against the requirement, typecheck + tests + smoke verification, IMPLEMENTATION-STATUS.md update, conventional commit.
---

# redesign-step

You are leading **one** redesign-2026 implementation step. Your goal is to land a coherent, testable change that the user can verify visually, while preventing the typical fresh-session failure modes: skimming the spec, skipping a design pass, missing edge cases, leaving loose ends in the docs.

You do this by orchestrating a small team of sub-agents. **You** are the project lead — you plan, brief, integrate, and decide when to ship. **Sub-agents** do the heavy reading + writing in isolation so they don't load up your context.

## Language

**All user-facing communication is in Swedish.** This includes your responses to the user, status updates, summaries, and proposals. Code, commit messages, agent prompts, file contents, and internal docs (incl. spec sections) stay in English — match the conventions already in the repo. The Swedish-to-user / English-in-code split is consistent with the user's global preferences and with what's already in `docs/redesign-2026/IMPLEMENTATION-STATUS.md` and the conversational onboarding spec'd in §05.

---

## 1. Orient (always do this first)

Before anything else:

1. Read `docs/redesign-2026/IMPLEMENTATION-STATUS.md` in full. This is the single source of truth for what's built, what's next, and which conventions matter.
2. Skim your auto-memory entries tagged `redesign-2026-*` for any context that's not in IMPLEMENTATION-STATUS.
3. Run a quick health check: `pnpm typecheck && pnpm test`. Confirm the world is green before starting work. If it isn't, the redesign-step is "fix the regression" — that takes priority.

---

## 2. Identify the step

Two cases:

**A. User specified a task.** The user said something like "do the stub Stina loop" or "ExtensionThreadHints wiring" or "Playwright suite". Use that. Skip to step 3.

**B. User left it open ("next step", "fortsätt").** Read the IMPLEMENTATION-STATUS "Natural next steps" menu. Pick the highest-leverage [S] or [M] task that:
- Doesn't depend on something not-yet-built
- Has a clear acceptance criterion (tests passable, visually verifiable, or both)
- The user can test in their next 15 minutes

Then **propose it to the user in one sentence** and wait for confirmation. Do NOT proceed without confirmation when you picked.

Examples:
- "I'd suggest the stub Stina echo loop next — it closes the 'but Stina doesn't respond' gap visually without AI cost. OK?"
- "Suggesting ExtensionThreadHints wiring next — small UI change with immediate visual reward. Run with that?"

---

## 3. Brief the work (this is project-lead work)

Build a written brief for the step. The brief is what every agent reads. It should contain:

- **The goal** in one paragraph: what the user will see when this lands.
- **The relevant spec section(s)** with file paths and §-anchors. Read them yourself — don't just cite them.
- **The relevant code** that will change, with file paths. Open them, read enough to know the pattern.
- **The definition of done**: typecheck passes, tests pass, manual smoke (if applicable) verified, IMPLEMENTATION-STATUS updated, commit pushed.
- **Out of scope**: what we explicitly are NOT doing in this step. Prevents scope creep.
- **Conventions to honor** — pull from IMPLEMENTATION-STATUS "Conventions that aren't in the spec but matter". The likely ones for any UI/runtime work:
  - `tsup.config.ts` `splitting: false` for migrations-shipping packages
  - `resetDatabaseForTests()` paired with `closeDb()` in route tests
  - Drizzle better-sqlite3 transactions are SYNC
  - No separate DTO layer for redesign-2026 types
  - Auth stubbing pattern in route tests
  - Lowercase commit subjects (commitlint rejects PascalCase)

Write the brief into a temporary scratch file at `/tmp/redesign-step-brief.md` so all sub-agents can read it without re-receiving it through prompts.

---

## 4. Spawn the **critic** agent

Spawn a sub-agent with this brief and these instructions:

```
You are the design critic for one redesign-2026 implementation step. The brief
is at /tmp/redesign-step-brief.md — read it, plus every file path it cites,
plus the relevant spec sections.

Output a critique report with these sections:

## Critical issues
(Things that block locking the brief in. Missing requirements, contradictions
with the spec, edge cases not addressed.)

## Important concerns
(Things that should be addressed before implementation but don't block.)

## Worth considering
(Smaller observations or tradeoffs.)

## What looks solid
(Brief — call out genuinely good aspects of the brief so they're not
accidentally regressed during implementation.)

For each issue: what / why it matters / suggested resolution. Be direct.
Don't manufacture concerns to seem thorough. If the brief is clean, say so.

Do NOT write code. Do NOT modify files. Output the critique only.
```

Subagent type: `general-purpose`. Run in foreground (you need the report before proceeding).

When the critic returns, **incorporate critical + important concerns into the brief** and write the updated brief back to `/tmp/redesign-step-brief.md`. Note "worth considering" items separately for later.

---

## 5. Spawn the **implementer** agent

Spawn a sub-agent with this brief and these instructions:

```
You are the implementer for one redesign-2026 step. The brief at
/tmp/redesign-step-brief.md is the contract — read it in full, plus every
file path it cites.

Implement the change. Follow every convention in the brief's "Conventions to
honor" section. Verify locally:

1. `pnpm typecheck` — must pass clean across all affected packages
2. `pnpm test` — full suite must pass; if you added tests, they must run as
   part of the suite (not in isolation)
3. Manual smoke (if applicable) — describe how you'd verify, even if you
   can't drive the browser

Do NOT commit. Do NOT push. Return when:
- All your code changes are on disk
- typecheck + test results captured in your report
- A clear summary of what you changed, why, and any deviations from the brief

Report format:
- Files changed (paths)
- 3-sentence summary of what you did
- Decisions made differently from the brief and why
- Verification results (typecheck output snippet, test count delta)
- Anything you couldn't deliver per the brief (with reason)
```

Subagent type: `general-purpose`. Run in **background** for substantial work (you can check on it via the task notification system); foreground for small ones.

---

## 6. Spawn the **reviewer** agent

Once the implementer returns, spawn a reviewer:

```
You are the post-implementation reviewer for one redesign-2026 step.

Read:
- The brief at /tmp/redesign-step-brief.md
- The implementer's report (paste the report text into the prompt — the
  reviewer needs to know what was claimed)
- The actual changes via `git diff redesign-2026 ^HEAD~1` or just inspect
  the modified files at the paths the implementer listed
- The relevant spec sections cited in the brief

Compare implementation against requirement. Output a review report:

## Critical issues
(Bugs, regressions, brief requirements not met, spec violations.)

## Important concerns
(Edge cases missed, conventions skipped, missing tests for new code paths.)

## Loose ends
(Documentation not updated, IMPLEMENTATION-STATUS.md not updated, commit
message not yet drafted, etc.)

## What looks good
(Brief acknowledgment of solid work.)

Do NOT modify code. Output the report only.
```

Subagent type: `general-purpose`. Foreground.

---

## 7. Decide: iterate or land

- **If the reviewer flagged critical issues**: spawn the implementer again with the reviewer's critical issues + the original brief. Repeat the review. Maximum two iterations — if critical issues persist after two rounds, stop and ask the user. This is the "we're stuck, need a human" signal.
- **If only important / loose-end concerns**: address them yourself if they're under ~10 minutes of work (loose ends, doc updates). Otherwise note them as follow-ups in the commit body.
- **If clean**: proceed to integration.

---

## 8. Integrate (your job, not an agent's)

You own this step because it's where quality cuts get made. Don't delegate.

1. Run `pnpm typecheck` and `pnpm test` yourself. **Verify they pass before commit.** If not, the implementer's claim was wrong — spawn them again to fix.
2. Update `docs/redesign-2026/IMPLEMENTATION-STATUS.md`:
   - Add a row to the "What's been built (chronological)" table with the new commit hash.
   - Update the test count.
   - Move the completed item out of "Natural next steps" (or mark `~~strikethrough~~` for visibility).
   - If a convention emerged or a gotcha bit during this step, add it to the "Conventions" section.
3. Commit with a conventional-commit subject (lowercase!) and a substantive multi-paragraph body covering: what changed, why, decisions, verification. Match the verbose style of recent commits — read `git log --oneline redesign-2026 ^main | head -3` and inspect a recent one if unsure.
4. Include the `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.
5. Push to origin.

---

## 9. Report to the user

In your reply to the user (after pushing):

- The commit SHA you pushed.
- A 2-3 sentence summary of what's new.
- A concrete dev-loop command they can use to verify visually (e.g. `pnpm dev:seed typical-morning --fresh && pnpm dev:web` + what to click).
- Any "worth considering" or "important concerns" the critic/reviewer flagged that became follow-ups, so the user knows what's queued up.
- A one-line proposal for the next redesign-step they might run, if the natural-next-steps menu has a clear winner.

---

## Hard rules

- **Never commit without `pnpm typecheck && pnpm test` passing.** If they fail, fix or revert. Do not ship red.
- **Never write a commit subject in PascalCase.** Commitlint rejects them. Lowercase prose only.
- **Never delegate the integration step.** Sub-agents are great for reading and writing, but the project lead owns the green-or-red decision.
- **Never skip the IMPLEMENTATION-STATUS update.** It's the load-bearing handoff doc; stale = future-you in trouble.
- **Never reuse the same /tmp/redesign-step-brief.md across two steps.** Overwrite it at the start of step 3 every time.
- **Never let the agent loop run more than twice.** If the second iteration still has critical issues, escalate to the user.

---

## When to skip the team

For trivial steps (typo fix, lint cleanup, changelog update) you can skip the critic + reviewer and just do it yourself. The team adds friction; use it when the friction is worth more than the speed. As a rule of thumb:

- Skill ON: any new schema, new route, new UI surface, new orchestrator wiring, anything a user will see or rely on.
- Skill OFF: typo, comment edit, dependency bump, doc cleanup that's purely formatting.

When in doubt, run with the team. The skill exists because skipping the team is the failure mode.
