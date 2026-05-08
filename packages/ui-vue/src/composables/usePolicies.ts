import { ref } from 'vue'
import { useApi } from './useApi.js'
import type { AutoPolicy } from '@stina/core'

/**
 * Reactive composable for AutoPolicy management (§06 autonomy).
 *
 * Usage: call `load()` + `loadAvailableTools()` in `onMounted`. Bind
 * `policies` to the list, `availableTools` to the create form's select.
 * Call `create()` to create a new policy (reloads the list on success).
 * Call `revoke(id)` to revoke a policy (reloads the list on success).
 */
export function usePolicies() {
  const api = useApi()
  const policies = ref<AutoPolicy[]>([])
  const availableTools = ref<Array<{ id: string; name: string; severity: 'high' }>>([])
  const loading = ref(false)
  const availableToolsError = ref<string | null>(null)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      policies.value = await api.policies.list()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  async function loadAvailableTools() {
    availableToolsError.value = null
    try {
      availableTools.value = await api.policies.availableTools()
    } catch (e) {
      availableToolsError.value = e instanceof Error ? e.message : String(e)
    }
  }

  async function create(input: { tool_id: string; standing_instruction_id?: string }) {
    await api.policies.create(input)
    await load()
  }

  async function revoke(id: string) {
    await api.policies.revoke(id)
    await load()
  }

  return {
    policies,
    availableTools,
    loading,
    availableToolsError,
    error,
    load,
    loadAvailableTools,
    create,
    revoke,
  }
}
