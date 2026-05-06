<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { usePolicies } from '../../composables/usePolicies.js'
import PoliciesViewPolicyRow from './PoliciesView.PolicyRow.vue'
import PoliciesViewCreateForm from './PoliciesView.CreateForm.vue'

/**
 * Autonomy policy management view (§06).
 *
 * Shows all active AutoPolicy rows and lets the user create or revoke them.
 * The create form is always visible below the list so the flow is one screen.
 */

const { policies, availableTools, loading, error, load, loadAvailableTools, create, revoke } =
  usePolicies()

// Separate error state for create form so API errors from create are surfaced there
const createError = ref<string | null>(null)
const createFormRef = ref<{ resetForm: () => void } | null>(null)

onMounted(async () => {
  await Promise.all([load(), loadAvailableTools()])
})

async function handleRevoke(id: string) {
  try {
    await revoke(id)
  } catch (e) {
    // Error from load() is surfaced via composable's error ref
    console.error('Failed to revoke policy', e)
  }
}

async function handleCreate(input: { tool_id: string; standing_instruction_id?: string }) {
  createError.value = null
  try {
    await create(input)
    // Reset form only on success — preserve input if the API returns an error
    createFormRef.value?.resetForm()
  } catch (e) {
    createError.value = e instanceof Error ? e.message : String(e)
  }
}
</script>

<template>
  <div class="policies-view">
    <header class="view-header">
      <h1 class="view-title">Autonomipolicyer</h1>
      <p class="view-subtitle">Regler för vad Stina får göra automatiskt</p>
    </header>

    <div v-if="error" class="global-error">{{ error }}</div>

    <section class="policy-list">
      <div v-if="loading" class="loading-state">Laddar policyer...</div>

      <div
        v-else-if="policies.length === 0"
        class="empty-state"
      >
        Inga policyer än. Skapa en nedan eller vänta tills Stina föreslår en.
      </div>

      <PoliciesViewPolicyRow
        v-for="policy in policies"
        :key="policy.id"
        :policy="policy"
        @revoke="handleRevoke(policy.id)"
      />
    </section>

    <section class="create-section">
      <PoliciesViewCreateForm
        ref="createFormRef"
        :available-tools="availableTools"
        :error="createError"
        @created="handleCreate"
      />
    </section>
  </div>
</template>

<style scoped>
.policies-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1.5rem;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}

.view-header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.view-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text, #1a1a1a);
}

.view-subtitle {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-secondary, #666);
}

.global-error {
  padding: 0.75rem 1rem;
  border-radius: var(--border-radius-normal, 6px);
  background-color: var(--color-rose-subtle, #fff1f2);
  color: var(--color-rose, #e11d48);
  font-size: 0.875rem;
}

.policy-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.loading-state,
.empty-state {
  font-size: 0.875rem;
  color: var(--text-secondary, #666);
  font-style: italic;
  padding: 0.5rem 0;
}

.create-section {
  margin-top: auto;
}
</style>
