<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ActivityLogEntry } from '@stina/core'
import { useApi } from '../../composables/useApi.js'

/**
 * Inline activity log entry rendering per §02 / §05.
 *
 * Renders memory_change, auto_action, action_blocked, event_silenced and
 * related kinds with severity-driven visual weight (low → quiet grey one-
 * liner, medium → visible row with icon, high → accented row with border-
 * left, critical → strong border).
 *
 * For action_blocked entries a multi-line layout is used showing intent,
 * blocker reason, verb badge, and a "Godkänn nu" button for no_matching_policy.
 */

const props = defineProps<{
  entry: ActivityLogEntry
}>()

const api = useApi()

const iconByKind: Record<string, string> = {
  memory_change: '✎',
  auto_action: '⚡',
  action_blocked: '⚠',
  event_silenced: '∅',
  event_handled: '•',
  thread_created: '＋',
  dream_pass_run: '☾',
  dream_pass_flag: '⚑',
  settings_migration: '⇄',
  migration_completed: '✓',
}
const icon = computed(() => iconByKind[props.entry.kind] ?? '•')

const labelByKind: Record<string, string> = {
  memory_change: 'Minne',
  auto_action: 'Auto-handling',
  action_blocked: 'Handling stoppad',
  event_silenced: 'Tyst hanterat',
  event_handled: 'Hanterat',
  thread_created: 'Tråd skapad',
  dream_pass_run: 'Drömpass',
  dream_pass_flag: 'Flaggat av Stina',
  settings_migration: 'Inställningsmigrering',
  migration_completed: 'Migrering klar',
}
const label = computed(() => labelByKind[props.entry.kind] ?? props.entry.kind)

const timestampLabel = computed(() =>
  new Date(props.entry.created_at).toLocaleTimeString('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
  })
)

// ── action_blocked specific ──────────────────────────────────────────────────

const reasonLabels: Record<string, string> = {
  no_matching_policy: 'Ingen policy för high-allvarlig verktyg',
  critical_severity: 'Kritisk allvarlighet — kan aldrig automatiseras',
  hallucinated_tool: 'Okänt verktyg (hallucination)',
}

const verbBadgeLabels: Record<string, string> = {
  skip: 'Hoppade över',
}

/** Parse action_blocked details safely. */
const blockedDetails = computed(() => {
  if (props.entry.kind !== 'action_blocked') return null
  const d = props.entry.details
  if (!d) return null
  const toolId = d['tool_id']
  const reason = d['reason']
  const chosenAlternative = d['chosen_alternative']
  const toolInput = d['tool_input']
  return {
    tool_id: typeof toolId === 'string' ? toolId : '',
    reason: typeof reason === 'string' ? reason : '',
    chosen_alternative: typeof chosenAlternative === 'string' ? chosenAlternative : '',
    tool_input: (toolInput as Record<string, unknown> | undefined) ?? {},
  }
})

const blockedReasonLabel = computed(() => {
  const r = blockedDetails.value?.reason ?? ''
  return reasonLabels[r] ?? r
})

const blockedVerbBadge = computed(() => {
  const alt = blockedDetails.value?.chosen_alternative ?? ''
  return verbBadgeLabels[alt] ?? alt
})

function inputSummary(input: Record<string, unknown> | undefined): string {
  if (!input || Object.keys(input).length === 0) return ''
  const raw = JSON.stringify(input)
  if (raw === '{}') return ''
  if (raw.length > 60) return raw.slice(0, 60) + '…'
  return raw
}

const blockedInputSummary = computed(() => inputSummary(blockedDetails.value?.tool_input))

// Approval state for this entry instance.
type ApprovalState = 'idle' | 'loading' | 'approved_new' | 'approved_dup' | 'error'
const approvalState = ref<ApprovalState>('idle')

function approvalStateLabel(state: ApprovalState): string {
  if (state === 'loading') return 'Skapar policy…'
  if (state === 'approved_new') return '✓ Policy skapad — gäller nästa gång'
  if (state === 'approved_dup') return '✓ Policy redan skapad'
  if (state === 'error') return '✗ Misslyckades — försök igen'
  return 'Godkänn nu'
}

async function approvePolicy(): Promise<void> {
  const state = approvalState.value
  if (state === 'loading' || state === 'approved_new' || state === 'approved_dup') return
  const toolId = blockedDetails.value?.tool_id
  if (!toolId) return

  approvalState.value = 'loading'
  try {
    await api.policies.create({ tool_id: toolId })
    approvalState.value = 'approved_new'
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const isDup = msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('already exists')
    approvalState.value = isDup ? 'approved_dup' : 'error'
  }
}
</script>

<template>
  <!-- action_blocked: expanded multi-line layout -->
  <div
    v-if="entry.kind === 'action_blocked'"
    class="ae ae--action_blocked ae--blocked-expanded"
    :class="[`ae--severity-${entry.severity}`]"
  >
    <div class="ae-blocked__header">
      <span class="ae__icon" aria-hidden="true">{{ icon }}</span>
      <span class="ae__label">{{ label }}</span>
      <span class="ae__time">{{ timestampLabel }}</span>
    </div>
    <div v-if="blockedDetails" class="ae-blocked__body">
      <div class="ae-blocked__row">
        <span class="ae-blocked__row-key">Ville:</span>
        <code class="ae-blocked__tool-call">{{ blockedDetails.tool_id }}{{ blockedInputSummary ? `(${blockedInputSummary})` : '' }}</code>
      </div>
      <div class="ae-blocked__row">
        <span class="ae-blocked__row-key">Hinder:</span>
        <span>{{ blockedReasonLabel }}</span>
      </div>
      <div class="ae-blocked__row">
        <span class="ae-blocked__row-key">Utfall:</span>
        <span class="ae-blocked__verb-badge">{{ blockedVerbBadge }}</span>
      </div>
      <div v-if="blockedDetails.reason === 'no_matching_policy'" class="ae-blocked__approve">
        <button
          :disabled="approvalState === 'loading' || approvalState === 'approved_new' || approvalState === 'approved_dup'"
          class="ae-blocked__approve-btn"
          :class="{
            'is-loading': approvalState === 'loading',
            'is-approved': approvalState === 'approved_new' || approvalState === 'approved_dup',
            'is-error': approvalState === 'error',
          }"
          @click="approvePolicy"
        >
          {{ approvalStateLabel(approvalState) }}
        </button>
      </div>
    </div>
  </div>

  <!-- All other kinds: compact grid layout -->
  <div
    v-else
    class="ae"
    :class="[`ae--${entry.kind}`, `ae--severity-${entry.severity}`]"
    :title="`${label} · ${timestampLabel}`"
  >
    <span class="ae__icon" aria-hidden="true">{{ icon }}</span>
    <span class="ae__label">{{ label }}</span>
    <span class="ae__summary">{{ entry.summary }}</span>
    <span class="ae__time">{{ timestampLabel }}</span>
  </div>
</template>

<style scoped>
.ae {
  display: grid;
  grid-template-columns: 1.25rem auto minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 0.5rem 0.75rem;
  padding: 0.375rem 0.875rem;
  border-radius: 4px;
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--color-text-muted, #6b6359);
  background: rgba(0, 0, 0, 0.015);
  align-self: stretch;
  margin: 0 1rem;

  > .ae__icon {
    color: var(--color-text-muted, #6b6359);
    opacity: 0.7;
  }

  > .ae__label {
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.7rem;
    font-weight: 600;
    opacity: 0.7;
    white-space: nowrap;
  }

  > .ae__summary {
    color: var(--color-text, #2a2722);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  > .ae__time {
    font-size: 0.7rem;
    opacity: 0.6;
    white-space: nowrap;
  }
}

/* Severity-driven visual weight per §05 severity table. */

.ae--severity-low {
  background: transparent;
  opacity: 0.7;

  > .ae__summary {
    color: var(--color-text-muted, #6b6359);
  }
}

.ae--severity-medium {
  background: rgba(0, 0, 0, 0.025);
}

.ae--severity-high {
  background: rgba(180, 138, 90, 0.08);
  border-left: 3px solid var(--color-accent, #b48a5a);
  padding-left: 0.625rem;

  > .ae__summary {
    color: var(--color-text, #2a2722);
    font-weight: 500;
  }
}

.ae--severity-critical {
  background: rgba(196, 115, 106, 0.1);
  border: 1px solid var(--color-accent-rose, #c4736a);
  border-left-width: 3px;
  padding: 0.5rem 0.875rem;

  > .ae__summary {
    color: var(--color-text, #2a2722);
    font-weight: 600;
  }
}

/* Per-kind tweaks where the §05 voice differs from severity alone. */

.ae--action_blocked {
  > .ae__icon {
    color: var(--color-accent-rose, #c4736a);
    opacity: 1;
  }
}

/* Expanded blocked entry layout */
.ae--blocked-expanded {
  display: block;
  padding: 0.5rem 0.875rem;

  > .ae-blocked__header {
    display: flex;
    align-items: baseline;
    gap: 0.5rem 0.75rem;
    flex-wrap: wrap;

    > .ae__icon {
      color: var(--color-accent-rose, #c4736a);
      opacity: 1;
    }

    > .ae__label {
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-size: 0.7rem;
      font-weight: 600;
      opacity: 0.7;
      white-space: nowrap;
    }

    > .ae__time {
      font-size: 0.7rem;
      opacity: 0.6;
      white-space: nowrap;
      margin-left: auto;
    }
  }

  > .ae-blocked__body {
    margin-top: 0.375rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding-left: 1.75rem;

    > .ae-blocked__row {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      font-size: 0.8rem;
      flex-wrap: wrap;

      > .ae-blocked__row-key {
        font-weight: 600;
        color: var(--color-text-muted, #6b6359);
        white-space: nowrap;
        min-width: 3.5rem;
      }

      > .ae-blocked__tool-call {
        background: rgba(0, 0, 0, 0.04);
        padding: 0.05rem 0.25rem;
        border-radius: 3px;
        font-size: 0.85em;
        color: var(--color-text, #2a2722);
        word-break: break-all;
      }

      > .ae-blocked__verb-badge {
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-accent-rose, #c4736a);
        background: rgba(196, 115, 106, 0.1);
        padding: 0.1rem 0.375rem;
        border-radius: 3px;
      }
    }

    > .ae-blocked__approve {
      margin-top: 0.25rem;

      > .ae-blocked__approve-btn {
        font: inherit;
        font-size: 0.8rem;
        padding: 0.25rem 0.625rem;
        border-radius: 4px;
        border: 1px solid var(--color-accent, #b48a5a);
        background: transparent;
        color: var(--color-accent, #b48a5a);
        cursor: pointer;

        &:hover:not(:disabled) {
          background: rgba(180, 138, 90, 0.08);
        }

        &:disabled {
          cursor: default;
          opacity: 0.8;
        }

        &.is-approved {
          border-color: var(--color-success, #4a7c4a);
          color: var(--color-success, #4a7c4a);
        }

        &.is-error {
          border-color: var(--color-error, #c34a4a);
          color: var(--color-error, #c34a4a);
        }
      }
    }
  }
}

.ae--auto_action {
  > .ae__icon {
    color: var(--color-accent, #b48a5a);
    opacity: 1;
  }
}
</style>
