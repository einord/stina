import type {
  ActivityLogEntry,
  ActivityLogKind,
  AutoPolicy,
  PolicyScope,
  ToolSeverity,
} from '@stina/core'
import { hoursAgo, idGenerator, minutesAgo } from './deterministic.js'

const policyId = idGenerator('tx-policy')
const entryId = idGenerator('tx-entry')

/**
 * Build an AutoPolicy with sane defaults. By default it is bound to a
 * standing instruction (the typical case per §06).
 */
export function makeAutoPolicy(overrides: Partial<AutoPolicy> = {}): AutoPolicy {
  return {
    id: overrides.id ?? policyId(),
    tool_id: overrides.tool_id ?? 'mail.reply',
    scope: overrides.scope ?? ({ standing_instruction_id: 'tx-instr-001' } as PolicyScope),
    mode: 'inform',
    created_at: overrides.created_at ?? hoursAgo(2),
    source_thread_id: overrides.source_thread_id ?? null,
    approval_count: overrides.approval_count ?? 4,
    created_by_suggestion: overrides.created_by_suggestion ?? true,
  }
}

/**
 * Build an ActivityLogEntry with sane defaults. The kind argument is required
 * because the rest of the shape depends on it.
 */
export function makeActivityLogEntry(
  kind: ActivityLogKind,
  overrides: Partial<Omit<ActivityLogEntry, 'kind'>> = {}
): ActivityLogEntry {
  const defaults = defaultsForKind(kind)
  return {
    id: overrides.id ?? entryId(),
    kind,
    severity: overrides.severity ?? defaults.severity,
    thread_id: overrides.thread_id ?? null,
    summary: overrides.summary ?? defaults.summary,
    details: overrides.details ?? defaults.details,
    created_at: overrides.created_at ?? minutesAgo(15),
    retention_days: overrides.retention_days ?? 365,
  }
}

interface KindDefaults {
  severity: ToolSeverity
  summary: string
  details: Record<string, unknown>
}

function defaultsForKind(kind: ActivityLogKind): KindDefaults {
  switch (kind) {
    case 'event_handled':
      return {
        severity: 'low',
        summary: 'Event arrived and was handled.',
        details: {},
      }
    case 'event_silenced':
      return {
        severity: 'low',
        summary: 'Event arrived; Stina chose to keep it in the background.',
        details: { reason: 'newsletter; no standing instruction matched' },
      }
    case 'auto_action':
      return {
        severity: 'high',
        summary: 'Auto-replied to mail from Peter per vacation instruction.',
        details: {
          tool_id: 'mail.reply',
          policy_id: 'tx-policy-001',
          standing_instruction_id: 'tx-instr-001',
        },
      }
    case 'action_blocked':
      return {
        severity: 'high',
        summary: 'Wanted to send a customer-escalation reply but tool requires confirmation.',
        details: {
          intended_tool_id: 'mail.send_external',
          blocker: 'no policy for high-severity tool',
          chosen_alternative: 'saved_draft',
          alternative_summary: 'Saved a draft and surfaced this thread.',
        },
      }
    case 'memory_change':
      return {
        severity: 'medium',
        summary: 'Saved to important memory: vacation auto-reply rule.',
        details: {
          memory_kind: 'standing_instruction',
          memory_id: 'tx-instr-002',
          action: 'create',
        },
      }
    case 'thread_created':
      return {
        severity: 'low',
        summary: 'New thread created.',
        details: {},
      }
    case 'dream_pass_run':
      return {
        severity: 'low',
        summary: 'Nightly consolidation pass completed.',
        details: {
          status: 'completed',
          tasks: { summarized: 3, expired: 1, flags: 2 },
          usage: { tokens: 8420 },
        },
      }
    case 'dream_pass_flag':
      return {
        severity: 'medium',
        summary: 'Possible contradiction in profile facts about Peter.',
        details: {
          flag_kind: 'contradiction',
          dedup_key: 'contradiction:user:manager_is',
          dream_pass_run_id: 'tx-entry-001',
        },
      }
    case 'settings_migration':
      return {
        severity: 'low',
        summary: 'Migrated setting: theme → Inställningar → Utseende.',
        details: { kind: 'setting', source_key: 'theme', target_key: 'theme' },
      }
    case 'migration_completed':
      return {
        severity: 'low',
        summary: 'Migration to redesign-2026 completed successfully.',
        details: { source_version: 'v0.36.0', target_version: 'v1.0.0' },
      }
    default: {
      const _exhaustive: never = kind
      throw new Error(`Unknown ActivityLogKind: ${String(_exhaustive)}`)
    }
  }
}
