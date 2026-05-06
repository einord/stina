<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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

const toolNameById = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  for (const tool of availableTools.value) {
    map[tool.id] = tool.name
  }
  return map
})

onMounted(async () => {
  await Promise.all([load(), loadAvailableTools()])
})

async function handleRevoke(id: string) {
  try {
    await revoke(id)
  } catch (e) {
    console.error('Failed to revoke policy', e)
  }
}

async function handleCreate(input: { tool_id: string; standing_instruction_id?: string }) {
  createError.value = null
  try {
    await create(input)
    createFormRef.value?.resetForm()
  } catch (e) {
    createError.value = e instanceof Error ? e.message : String(e)
  }
}
</script>

<template>
  <div class="policies-view">
    <header class="view-header">
      <h1 class="view-title">Autonomi</h1>
      <p class="view-subtitle">
        Här bestämmer du vad Stina får göra på egen hand. En policy ger henne lov
        att använda ett specifikt verktyg utan att fråga dig först — t.ex. att
        skicka e-post, arkivera meddelanden eller liknande. Du kan återkalla en
        policy när som helst.
      </p>
    </header>

    <div v-if="error" class="global-error">{{ error }}</div>

    <section class="policy-list-section">
      <h2 class="section-title">Aktiva policyer</h2>

      <div v-if="loading" class="loading-state">Laddar policyer…</div>

      <div
        v-else-if="policies.length === 0"
        class="empty-state"
      >
        <p>Du har inga policyer än.</p>
        <p class="empty-hint">
          Stina kommer att fråga dig innan hon använder ett verktyg som kan ha
          större påverkan. Skapar du en policy nedan slipper du frågan i fortsättningen.
        </p>
      </div>

      <div v-else class="policy-list">
        <PoliciesViewPolicyRow
          v-for="policy in policies"
          :key="policy.id"
          :policy="policy"
          :tool-name-by-id="toolNameById"
          @revoke="handleRevoke(policy.id)"
        />
      </div>
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
  gap: 0.4rem;
  max-width: 60ch;
}

.view-title {
  margin: 0;
  font-size: 1.4rem;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text, #1a1a1a);
}

.view-subtitle {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-secondary, #666);
  line-height: 1.5;
}

.global-error {
  padding: 0.75rem 1rem;
  border-radius: var(--border-radius-normal, 6px);
  background-color: var(--color-rose-subtle, #fff1f2);
  color: var(--color-rose, #e11d48);
  font-size: 0.875rem;
}

.policy-list-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.section-title {
  margin: 0 0 0.25rem;
  font-size: 0.85rem;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-secondary, #666);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.policy-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.loading-state {
  font-size: 0.875rem;
  color: var(--text-secondary, #666);
  font-style: italic;
  padding: 0.5rem 0;
}

.empty-state {
  padding: 1rem;
  border-radius: var(--border-radius-normal, 6px);
  border: 1px dashed var(--theme-general-border-color, #e0e0e0);
  color: var(--text-secondary, #666);
  font-size: 0.875rem;
}

.empty-state p {
  margin: 0;
}

.empty-hint {
  margin-top: 0.4rem !important;
  font-size: 0.825rem;
  color: var(--text-tertiary, #888);
  line-height: 1.4;
}

.create-section {
  margin-top: auto;
}
</style>
