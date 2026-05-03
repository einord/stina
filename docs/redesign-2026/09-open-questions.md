# 09 — Open Questions

Cross-cutting questions that don't fit a single section, plus a running list of decisions we've deferred.

Section-local questions live in the "Open questions" section of each individual file.

## Cross-cutting

- **Success metrics.** What does "the redesign worked" look like? Candidates: fewer interruptions per day, faster time-to-first-action on incoming events, number of auto-policies created, qualitative user-reported focus. Need a primary metric before implementation.
- **Telemetry for success metrics**: §08 already specifies opt-in beta-channel migration telemetry (Inställningar → Telemetri). The remaining open question is whether we want a *separate* runtime telemetry channel for ongoing success-metric data (interruption counts, auto-policy adoption, etc.), or whether qualitative user feedback is enough.
- **Documentation surface**: end-user docs explaining the new model. Where does this live? Website (`stina.app`), in-app, both?
- **Tutorial / onboarding beyond v1**: §05 specifies a welcome thread (first-launch and post-upgrade) that introduces the model and offers three setup actions. Open question: do we ship additional onboarding (video, interactive walkthrough, in-app tour) on top of the welcome thread, or trust the welcome thread + the design's self-explanatory shape?

## Deferred decisions

These are intentional defers — we agreed to think about them after v1 ships.

- **Cost-per-event optimization** (two-tier triage with cheap classifier). Phase 2.
- **Thread grouping / projects**. Wait until thread sprawl is observed, then design.
- **Cross-thread reference clickability** in UI. Decided to handle in recap for now.
- **Multi-user / shared threads**. Out of scope for redesign.

## Process

- **When does the spec freeze?** We should pick a moment to declare "design is locked, implementation begins" — otherwise the spec keeps drifting and nothing ships.
- **Review checkpoints**: do we run a critique pass on the full spec before any code, after data model is implemented, or both?
