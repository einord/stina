/**
 * @stina/autonomy — auto-policies, severity enforcement, activity log.
 *
 * Implements the autonomy and severity layer described in
 * docs/redesign-2026/02-data-model.md (§Tool severity, §Auto-policy,
 * §Activity log entry) and docs/redesign-2026/06-autonomy.md (v1 trust
 * model, collision handling, policy creation/revocation flow).
 *
 * Public types live in @stina/core (ToolSeverity, AutoPolicy,
 * ActivityLogEntry, etc.). This package owns the database schema, the
 * migrations, the policy registry, the severity-driven approval gate, the
 * collision-handling logic (Escalate / Skip / Solve differently), and the
 * activity-log writer.
 *
 * v0.1.0: skeleton — schema and types only. Implementation lands in
 * subsequent commits.
 */

export {} // intentional empty barrel until implementation lands
