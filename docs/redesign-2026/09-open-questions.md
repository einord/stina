# 09 — Open Questions

Cross-cutting questions that don't fit a single section, plus a running list of decisions we've deferred.

Section-local questions live in the "Open questions" section of each individual file.

## Cross-cutting

- **Success metrics.** What does "the redesign worked" look like? Candidates: fewer interruptions per day, faster time-to-first-action on incoming events, number of auto-policies created, qualitative user-reported focus. Need a primary metric before implementation.
- **Telemetry**: do we need any local-first usage stats to measure the above? Privacy-respecting opt-in, or no telemetry at all?
- **Documentation surface**: end-user docs explaining the new model. Where does this live? Website (`stina.app`), in-app, both?
- **Tutorial / onboarding**: new mental model is significant. First-launch walkthrough, video, or trust the design to be self-explanatory?

## Deferred decisions

These are intentional defers — we agreed to think about them after v1 ships.

- **Cost-per-event optimization** (two-tier triage with cheap classifier). Phase 2.
- **Thread grouping / projects**. Wait until thread sprawl is observed, then design.
- **Cross-thread reference clickability** in UI. Decided to handle in recap for now.
- **Multi-user / shared threads**. Out of scope for redesign.

## Process

- **When does the spec freeze?** We should pick a moment to declare "design is locked, implementation begins" — otherwise the spec keeps drifting and nothing ships.
- **Review checkpoints**: do we run a critique pass on the full spec before any code, after data model is implemented, or both?
