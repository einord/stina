<script setup lang="ts">
import { computed } from 'vue'
import type { AutoPolicy } from '@stina/core'
import { useRelativeTime } from '../../composables/useRelativeTime.js'

/**
 * Single AutoPolicy row for the Policies view.
 * Shows a human-readable tool name (when known), scope, provenance badge,
 * creation time, and a revoke button. The raw tool ID is shown as a
 * secondary detail under the name so power users can still see it.
 */
const props = defineProps<{
  policy: AutoPolicy
  /** Lookup of tool id -> human-readable name. Tools may be missing if their
   * extension was uninstalled or the severity dropped — fall back to the id. */
  toolNameById: Record<string, string>
}>()

const emit = defineEmits<{
  (e: 'revoke'): void
}>()

const toolDisplayName = computed(
  () => props.toolNameById[props.policy.tool_id] ?? props.policy.tool_id
)
const showRawId = computed(() => toolDisplayName.value !== props.policy.tool_id)

const scopeLabel = computed(() => {
  if (props.policy.scope.standing_instruction_id) {
    return 'Bunden till en stående instruktion'
  }
  return 'Gäller alltid'
})

const createdAt = useRelativeTime(() => props.policy.created_at)
</script>

<template>
  <div class="policy-row">
    <div class="policy-info">
      <div class="policy-header">
        <span class="tool-name">{{ toolDisplayName }}</span>
        <span v-if="policy.created_by_suggestion" class="badge suggestion-badge">
          Förslag från Stina
        </span>
      </div>
      <div v-if="showRawId" class="tool-id-secondary">{{ policy.tool_id }}</div>
      <div class="policy-meta">
        <span class="meta-item">{{ scopeLabel }}</span>
        <span class="meta-separator">·</span>
        <span class="meta-item">Skapad {{ createdAt }}</span>
        <template v-if="policy.approval_count > 0">
          <span class="meta-separator">·</span>
          <span class="meta-item">
            Använd {{ policy.approval_count }} {{ policy.approval_count === 1 ? 'gång' : 'gånger' }}
          </span>
        </template>
      </div>
    </div>
    <button class="revoke-button" @click="emit('revoke')">Återkalla</button>
  </div>
</template>

<style scoped>
.policy-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-radius: var(--border-radius-normal, 6px);
  border: 1px solid var(--theme-general-border-color, #e0e0e0);
  background-color: var(--theme-main-components-main-background, #fff);
}

.policy-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
  min-width: 0;
}

.policy-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.tool-name {
  font-size: 0.95rem;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text, #1a1a1a);
}

.tool-id-secondary {
  font-family: var(--font-mono, monospace);
  font-size: 0.75rem;
  color: var(--text-tertiary, #999);
}

.policy-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: var(--text-secondary, #666);
  margin-top: 0.15rem;
}

.meta-separator {
  color: var(--text-tertiary, #bbb);
}

.badge {
  display: inline-block;
  padding: 0.1rem 0.4rem;
  border-radius: 9999px;
  font-size: 0.7rem;
  font-weight: var(--font-weight-medium, 500);
}

.suggestion-badge {
  background-color: var(--color-primary-subtle, #e8f0fe);
  color: var(--primary, #2563eb);
}

.revoke-button {
  flex-shrink: 0;
  padding: 0.3rem 0.75rem;
  font-size: 0.8rem;
  border-radius: var(--border-radius-small, 4px);
  border: 1px solid var(--color-rose-border, #fca5a5);
  background-color: transparent;
  color: var(--color-rose, #e11d48);
  cursor: pointer;
  transition: background-color 0.15s;

  &:hover {
    background-color: var(--color-rose-subtle, #fff1f2);
  }
}
</style>
