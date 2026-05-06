<script setup lang="ts">
import { ref } from 'vue'

/**
 * Form for creating a new AutoPolicy (§06).
 * Tool is picked from `availableTools`; `standing_instruction_id` is optional.
 * Emits `created` on success (after form reset).
 */
const props = defineProps<{
  availableTools: Array<{ id: string; name: string; severity: 'high' }>
  error: string | null
}>()

const emit = defineEmits<{
  (e: 'created', input: { tool_id: string; standing_instruction_id?: string }): void
}>()

const selectedToolId = ref('')
const standingInstructionId = ref('')
const submitting = ref(false)
const localError = ref<string | null>(null)

async function handleSubmit() {
  if (!selectedToolId.value) return

  submitting.value = true
  localError.value = null

  try {
    const input: { tool_id: string; standing_instruction_id?: string } = {
      tool_id: selectedToolId.value,
    }
    if (standingInstructionId.value.trim()) {
      input.standing_instruction_id = standingInstructionId.value.trim()
    }
    emit('created', input)
    // Form is reset by the parent calling resetForm() after the async create succeeds.
    // Do NOT reset here — the user would lose their input if the API returns a 422.
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  selectedToolId.value = ''
  standingInstructionId.value = ''
}

defineExpose({ resetForm })
</script>

<template>
  <div class="create-form">
    <h3 class="form-title">Skapa policy</h3>

    <div v-if="availableTools.length === 0" class="no-tools-message">
      Inga high-allvarlighetsverktyg tillgängliga (starta appen med ett extension installerat)
    </div>

    <form v-else @submit.prevent="handleSubmit">
      <div class="form-field">
        <label for="policy-tool-id">Verktyg</label>
        <select
          id="policy-tool-id"
          v-model="selectedToolId"
          :disabled="availableTools.length === 0"
          required
        >
          <option value="" disabled>Välj verktyg...</option>
          <option v-for="tool in availableTools" :key="tool.id" :value="tool.id">
            {{ tool.name }}
          </option>
        </select>
      </div>

      <div class="form-field">
        <label for="policy-instruction-id">Instruktions-ID (valfritt)</label>
        <input
          id="policy-instruction-id"
          v-model="standingInstructionId"
          type="text"
          placeholder="Instruktions-ID (valfritt)"
        />
        <span class="help-text">Lämna tomt för fri policy</span>
      </div>

      <div v-if="error" class="error-message">{{ error }}</div>

      <button type="submit" class="submit-button" :disabled="!selectedToolId || submitting">
        <span v-if="submitting">Skapar...</span>
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
  margin: 0 0 1rem;
  font-size: 0.9rem;
  font-weight: var(--font-weight-medium, 500);
  color: var(--text, #1a1a1a);
}

.no-tools-message {
  font-size: 0.85rem;
  color: var(--text-secondary, #666);
  font-style: italic;
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

select,
input[type='text'] {
  padding: 0.4rem 0.6rem;
  border-radius: var(--border-radius-small, 4px);
  border: 1px solid var(--theme-general-border-color, #e0e0e0);
  background-color: var(--theme-input-background, #fff);
  color: var(--text, #1a1a1a);
  font-size: 0.875rem;
  width: 100%;
}

.help-text {
  font-size: 0.75rem;
  color: var(--text-tertiary, #999);
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
