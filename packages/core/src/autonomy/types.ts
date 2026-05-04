/**
 * Autonomy types — see docs/redesign-2026/02-data-model.md §Tool severity,
 * §Auto-policy, §Activity log entry, and docs/redesign-2026/06-autonomy.md.
 *
 * The unified severity scale drives BOTH UI rendering and approval flow.
 * There is no separate "lock" field. Critical tools cannot be auto-policied.
 */

/**
 * Single source of truth for tool risk and visual emphasis.
 *
 * - low: barely visible, executes silently
 * - medium: visible but unobtrusive, executes without asking
 * - high: prominent rendering; auto-executes if a policy exists, otherwise
 *   asks (or escalates per §06 collision handling)
 * - critical: blocking prompt; never auto-policied; respects platform
 *   notification limits per §05
 */
export type ToolSeverity = 'low' | 'medium' | 'high' | 'critical'

/**
 * Where an auto-policy applies. Bound to a standing instruction (typical
 * case) or a free-standing context match.
 */
export interface PolicyScope {
  /** Policy is only valid while this instruction is active. */
  standing_instruction_id?: string
  /**
   * Optional structured hint for runtime context matching. Stina-judged
   * (LLM) at event time per §03; not a binding match algorithm.
   */
  match?: Record<string, unknown>
  /**
   * Trigger kinds this policy may activate for. If omitted, the policy
   * applies to any trigger kind permitted by the parent instruction.
   * See §06 open question on policy scope binding.
   */
  trigger_kinds?: ('user' | 'mail' | 'calendar' | 'scheduled' | 'stina')[]
}

/**
 * Records "Stina may invoke <tool_id> automatically in scope <scope>".
 *
 * In v1, mode is always 'inform' — action policies always log to recap.
 * The 'silent' value is reserved on `ActivityLogEntry.kind` (event_silenced
 * and internal Stina reasoning), never on AutoPolicy.
 *
 * Per §02 auto-policy creation guard: policies cannot be created in threads
 * where trigger.kind !== 'user' without an explicit interactive user
 * approval outside the autonomous handling.
 */
export interface AutoPolicy {
  id: string
  tool_id: string
  scope: PolicyScope
  /** Always 'inform' in v1; reserved field for future extensions. */
  mode: 'inform'
  created_at: number
  source_thread_id: string | null
  /** How many times the user approved before this policy was created. */
  approval_count: number
  /** Records whether this policy came from a Stina suggestion or user-initiated creation. */
  created_by_suggestion: boolean
}

/**
 * Activity log entry kinds. See §02 ActivityLogEntry and the per-section docs
 * for details on each kind's `details` shape.
 */
export type ActivityLogKind =
  | 'event_handled'
  | 'event_silenced'
  | 'auto_action'
  | 'action_blocked'
  | 'memory_change'
  | 'thread_created'
  | 'dream_pass_run'
  | 'dream_pass_flag'
  | 'settings_migration'
  | 'migration_completed'

/**
 * Append-only audit record. Surfaces in recap, in the activity log under
 * the menu, and (for entries with a thread_id) inline in the thread at the
 * created_at position.
 *
 * `severity`:
 * - For tool-driven kinds (auto_action, action_blocked, memory_change tied
 *   to a tool), inherited from the underlying tool.
 * - For non-tool kinds (event_silenced, dream_pass_*, settings_migration,
 *   migration_completed, thread_created, event_handled-without-tool),
 *   defaults to 'low'.
 *
 * `retention_days`:
 * - Default 365 across all kinds; user-configurable downward in settings.
 * - Auto-cleanup runs daily and deletes entries past their retention.
 */
export interface ActivityLogEntry {
  id: string
  kind: ActivityLogKind
  severity: ToolSeverity
  thread_id: string | null
  summary: string
  details: Record<string, unknown>
  created_at: number
  retention_days: number
}

/**
 * Tool manifest fields the redesign introduces. Extensions declare these in
 * their tool manifest; the runtime enforces them.
 *
 * - severity: required for new tools; existing tools default to 'medium' at
 *   load time with a one-time dream_pass_flag for review per §08
 * - redactor: optional; without one, audit-time output gets
 *   "[redacted: no redactor declared]" plus an entry flag
 * - engines.stina: optional min-Stina-version constraint
 * - api_version: recommended; declares which extension API contract version
 *   the extension targets (used by the audit CLI per §08)
 */
export interface ToolManifestExtensions {
  severity: ToolSeverity
  redactor?: string
  'engines.stina'?: string
  api_version?: string
}
