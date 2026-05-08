/**
 * @stina/autonomy — auto-policies, severity enforcement gate (later),
 * activity log.
 *
 * Implements the autonomy and severity layer described in
 * docs/redesign-2026/02-data-model.md (§Tool severity, §Auto-policy,
 * §Activity log entry) and docs/redesign-2026/06-autonomy.md (v1 trust
 * model, collision handling, policy creation/revocation flow).
 *
 * Public types live in @stina/core. This package owns the database schema,
 * the migrations, the policy registry with the §02 creation guards, and the
 * activity-log writer.
 */

export {
  AutoPolicyRepository,
  ActivityLogRepository,
  autoPolicies,
  activityLogEntries,
  autonomySchema,
  getAutonomyMigrationsPath,
  type AutonomyDb,
  type CreateAutoPolicyInput,
  type AppendEntryInput,
  type ListEntriesOptions,
} from './db/index.js'
