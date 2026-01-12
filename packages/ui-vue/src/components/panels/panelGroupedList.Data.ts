import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import type { PanelGroupedListView, PanelValue } from '@stina/extension-api'
import type { ApiClient, ExtensionEvent, PanelViewInfo } from '../../composables/useApi.js'
import type { PanelGroupedListRecord } from './panelGroupedList.Types.js'

type UnknownRecord = PanelGroupedListRecord

export interface PanelGroupedListDataOptions {
  panel: PanelViewInfo
  view: Ref<PanelGroupedListView>
  api: ApiClient
  extensionEvents: {
    subscribe(handler: (event: ExtensionEvent) => void): () => void
  }
  resolveParams: (
    params: Record<string, PanelValue> | undefined,
    context: UnknownRecord
  ) => Record<string, unknown>
  getValue: (target: unknown, path: string) => unknown
}

export function usePanelGroupedListData(options: PanelGroupedListDataOptions) {
  const { panel, view, api, extensionEvents, resolveParams, getValue } = options
  const loading = ref(false)
  const error = ref<string | null>(null)
  const groups = ref<UnknownRecord[]>([])
  let stopEvents: (() => void) | null = null

  const loadGroups = async (): Promise<void> => {
    loading.value = true
    error.value = null

    try {
      const result = await api.tools.executeTool(
        panel.extensionId,
        view.value.data.toolId,
        resolveParams(view.value.data.params, {})
      )

      if (!result.success) {
        throw new Error(result.error ?? result.message ?? 'Failed to load panel data')
      }

      const data = result.data
      const resultKey = view.value.data.resultKey ?? 'groups'
      const resolved = Array.isArray(data) ? data : getValue(data, resultKey)
      groups.value = Array.isArray(resolved) ? (resolved as UnknownRecord[]) : []
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load panel data'
      groups.value = []
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    void loadGroups()

    const refreshEvents = view.value.data.refreshEvents ?? []
    if (refreshEvents.length === 0) return

    const refreshSet = new Set(refreshEvents)
    stopEvents = extensionEvents.subscribe((event) => {
      if (event.extensionId !== panel.extensionId) return
      if (!refreshSet.has(event.name)) return
      void loadGroups()
    })
  })

  onBeforeUnmount(() => {
    stopEvents?.()
  })

  return {
    loading,
    error,
    groups,
    loadGroups,
  }
}
