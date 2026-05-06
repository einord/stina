<script setup lang="ts">
import { computed } from 'vue'
import type { AutoPolicy } from '@stina/core'
import { useRelativeTime } from '../../composables/useRelativeTime.js'

/**
 * Single AutoPolicy row for the Policies view.
 * Shows tool ID, scope, approval count, provenance badge, creation time,
 * and a revoke button.
 */
const props = defineProps<{
  policy: AutoPolicy
}>()

const emit = defineEmits<{
  (e: 'revoke'): void
}>()

const scopeLabel = computed(() => {
  if (props.policy.scope.standing_instruction_id) {
    return `Instruktion: ${props.policy.scope.standing_instruction_id}`
  }
  return 'Alla kontexter'
})

const createdAt = useRelativeTime(() => props.policy.created_at)
</script>

<template>
  <div class="policy-row">
    <div class="policy-info">
      <div class="policy-field">
        <span class="label">Verktyg:</span>
        <span class="value tool-id">{{ policy.tool_id }}</span>
        <span v-if="policy.created_by_suggestion" class="badge suggestion-badge">Stinas förslag</span>
      </div>
      <div class="policy-field">
        <span class="label">Scope:</span>
        <span class="value">{{ scopeLabel }}</span>
      </div>
      <div class="policy-field">
        <span class="label">Godkänd:</span>
        <span class="value">{{ policy.approval_count }} gånger</span>
      </div>
      <div class="policy-field">
        <span class="label">Skapad:</span>
        <span class="value">{{ createdAt }}</span>
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

.policy-field {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  font-size: 0.875rem;
}

.label {
  color: var(--text-secondary, #666);
  white-space: nowrap;
  font-weight: var(--font-weight-medium, 500);
  min-width: 5rem;
}

.value {
  color: var(--text, #1a1a1a);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-id {
  font-family: var(--font-mono, monospace);
  font-size: 0.8rem;
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
