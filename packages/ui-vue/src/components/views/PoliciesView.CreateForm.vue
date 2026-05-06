<script setup lang="ts">
import { ref } from 'vue'

/**
 * Form for creating a new AutoPolicy (§06).
 * Tool is picked from `availableTools`; standing-instruction binding is
 * deferred to a later step (no list endpoint yet).
 */
defineProps<{
  availableTools: Array<{ id: string; name: string; severity: 'high' }>
  error: string | null
}>()

const emit = defineEmits<{
  (e: 'created', input: { tool_id: string; standing_instruction_id?: string }): void
}>()

const selectedToolId = ref('')
const submitting = ref(false)

async function handleSubmit() {
  if (!selectedToolId.value) return

  submitting.value = true
  try {
    emit('created', { tool_id: selectedToolId.value })
    // Parent calls resetForm() on success. Don't reset here.
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  selectedToolId.value = ''
}

defineExpose({ resetForm })
</script>

<template>
  <div class="create-form">
    <h3 class="form-title">Skapa ny policy</h3>
    <p class="form-help">
      Välj ett verktyg som Stina ska få använda automatiskt utan att fråga.
      Du kan återkalla policyn när som helst.
    </p>

    <div v-if="availableTools.length === 0" class="no-tools-message">
      Inga verktyg med hög allvarlighet är tillgängliga just nu. När ett
      tillägg installeras som exponerar sådana verktyg dyker de upp här.
    </div>

    <form v-else @submit.prevent="handleSubmit">
      <div class="form-field">
        <label for="policy-tool-id">Verktyg</label>
        <select
          id="policy-tool-id"
          v-model="selectedToolId"
          required
        >
          <option value="" disabled>Välj ett verktyg…</option>
          <option v-for="tool in availableTools" :key="tool.id" :value="tool.id">
            {{ tool.name }}
          </option>
        </select>
      </div>

      <div v-if="error" class="error-message">{{ error }}</div>

      <button type="submit" class="submit-button" :disabled="!selectedToolId || submitting">
        <span v-if="submitting">Skapar…</span>
        <span v-else>Skapa policy</span>
      </button>
    </form>
  </div>
</template>

<style scoped>
.create-form {
  padding: 1rem;
  border-radius: var(--border-radius-normal, 6px);
  border: 1px solid var(--theme-general-border-color, #e0e0e0);
  background-color: var(--theme-main-components-main-background, #fff);
}

.form-title {
  margin: 0 0 0.25rem;
  font-size: 0.95rem;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text, #1a1a1a);
}

.form-help {
  margin: 0 0 1rem;
  font-size: 0.825rem;
  color: var(--text-secondary, #666);
  line-height: 1.4;
}

.no-tools-message {
  font-size: 0.85rem;
  color: var(--text-secondary, #666);
  font-style: italic;
  line-height: 1.4;
}

form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

label {
  font-size: 0.8rem;
  font-weight: var(--font-weight-medium, 500);
  color: var(--text-secondary, #666);
}

select {
  padding: 0.4rem 0.6rem;
  border-radius: var(--border-radius-small, 4px);
  border: 1px solid var(--theme-general-border-color, #e0e0e0);
  background-color: var(--theme-input-background, #fff);
  color: var(--text, #1a1a1a);
  font-size: 0.875rem;
  width: 100%;
}

.error-message {
  padding: 0.5rem 0.75rem;
  border-radius: var(--border-radius-small, 4px);
  background-color: var(--color-rose-subtle, #fff1f2);
  color: var(--color-rose, #e11d48);
  font-size: 0.85rem;
}

.submit-button {
  align-self: flex-start;
  padding: 0.4rem 1rem;
  border-radius: var(--border-radius-small, 4px);
  border: none;
  background-color: var(--primary, #2563eb);
  color: white;
  font-size: 0.875rem;
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  transition: opacity 0.15s;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    opacity: 0.9;
  }
}
</style>
