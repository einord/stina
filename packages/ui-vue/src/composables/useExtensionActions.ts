import { ref } from 'vue'
import type { ActionResult } from '@stina/extension-api'
import { useApi, type ActionInfo } from './useApi.js'

/**
 * Composable for executing extension actions from the UI
 */
export function useExtensionActions() {
  const api = useApi()
  const loading = ref(false)
  const error = ref<string | null>(null)

  /**
   * Execute an action in an extension
   * @param extensionId The extension that provides the action
   * @param actionId The action ID
   * @param params Parameters for the action
   * @returns Action execution result
   */
  async function executeAction(
    extensionId: string,
    actionId: string,
    params: Record<string, unknown> = {}
  ): Promise<ActionResult> {
    loading.value = true
    error.value = null

    try {
      const result = await api.actions.execute(extensionId, actionId, params)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      error.value = message
      return { success: false, error: message }
    } finally {
      loading.value = false
    }
  }

  /**
   * List all registered actions
   */
  async function listActions(): Promise<ActionInfo[]> {
    try {
      return await api.actions.list()
    } catch {
      return []
    }
  }

  return {
    executeAction,
    listActions,
    loading,
    error,
  }
}
