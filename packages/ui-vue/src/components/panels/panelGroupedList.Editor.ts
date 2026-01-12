import { ref, type Ref } from 'vue'
import type { PanelGroupedListView, PanelValue, SettingDefinition } from '@stina/extension-api'
import type { ApiClient, PanelViewInfo } from '../../composables/useApi.js'
import type { PanelGroupedListRecord } from './panelGroupedList.Types.js'
import type { PanelGroupedListAccessors } from './panelGroupedList.Accessors.js'

type UnknownRecord = PanelGroupedListRecord

export interface PanelGroupedListEditorOptions {
  panel: PanelViewInfo
  view: Ref<PanelGroupedListView>
  api: ApiClient
  accessors: Pick<PanelGroupedListAccessors, 'getItemId' | 'getItemTitle'>
  loadGroups: () => Promise<void>
  buildDefaultValues: (fields: SettingDefinition[] | undefined) => Record<string, unknown>
  buildFormValues: (
    fields: SettingDefinition[] | undefined,
    data: Record<string, unknown>
  ) => Record<string, unknown>
  applyCreateDefaults: (
    defaults: Record<string, PanelValue> | undefined,
    context: UnknownRecord,
    currentValues: Record<string, unknown>
  ) => Record<string, unknown>
}

export function usePanelGroupedListEditor(options: PanelGroupedListEditorOptions) {
  const {
    panel,
    view,
    api,
    accessors,
    loadGroups,
    buildDefaultValues,
    buildFormValues,
    applyCreateDefaults,
  } = options
  const editorOpen = ref(false)
  const editorLoading = ref(false)
  const editorError = ref<string | null>(null)
  const editorValues = ref<Record<string, unknown>>({})
  const editorItemId = ref<string | null>(null)
  const editorTitle = ref<string>('Edit item')
  const editorCreateLabel = ref<string>('New item')

  const openEditor = async (item: UnknownRecord) => {
    const editor = view.value.editor
    if (!editor) return

    editorLoading.value = true
    editorError.value = null
    editorOpen.value = true
    editorValues.value = buildDefaultValues(editor.fields)

    const itemId = accessors.getItemId(item)
    editorItemId.value = itemId || null
    editorTitle.value = editor.title ?? `Edit ${accessors.getItemTitle(item)}`
    editorCreateLabel.value = editor.createLabel ?? 'New item'

    const idParam = editor.idParam ?? 'id'

    try {
      if (editor.getToolId && itemId) {
        const result = await api.tools.executeTool(panel.extensionId, editor.getToolId, {
          [idParam]: itemId,
        })

        if (!result.success) {
          throw new Error(result.error ?? result.message ?? 'Failed to load item')
        }

        const data = (result.data ?? {}) as Record<string, unknown>
        editorValues.value = buildFormValues(editor.fields, data)
      } else {
        editorValues.value = buildFormValues(editor.fields, item)
      }
    } catch (error) {
      editorError.value = error instanceof Error ? error.message : 'Failed to load item'
    } finally {
      editorLoading.value = false
    }
  }

  const openCreate = () => {
    const editor = view.value.editor
    if (!editor) return

    editorLoading.value = false
    editorError.value = null
    editorOpen.value = true
    editorItemId.value = null
    editorTitle.value = editor.createLabel ?? 'New item'
    editorCreateLabel.value = editor.createLabel ?? 'New item'
    editorValues.value = buildDefaultValues(editor.fields)
    editorValues.value = applyCreateDefaults(editor.createDefaults, {}, editorValues.value)
  }

  const saveEditor = async () => {
    const editor = view.value.editor
    if (!editor) return

    editorLoading.value = true
    editorError.value = null
    const idParam = editor.idParam ?? 'id'

    try {
      const params: Record<string, unknown> = { ...editorValues.value }
      if (editorItemId.value && !(idParam in params)) {
        params[idParam] = editorItemId.value
      }

      const result = await api.tools.executeTool(panel.extensionId, editor.upsertToolId, params)

      if (!result.success) {
        throw new Error(result.error ?? result.message ?? 'Failed to save item')
      }

      editorOpen.value = false
      await loadGroups()
    } catch (error) {
      editorError.value = error instanceof Error ? error.message : 'Failed to save item'
    } finally {
      editorLoading.value = false
    }
  }

  const deleteEditorItem = async () => {
    const editor = view.value.editor
    const itemId = editorItemId.value
    if (!editor?.deleteToolId || !itemId) return

    editorLoading.value = true
    editorError.value = null
    const idParam = editor.idParam ?? 'id'

    try {
      const result = await api.tools.executeTool(panel.extensionId, editor.deleteToolId, {
        [idParam]: itemId,
      })

      if (!result.success) {
        throw new Error(result.error ?? result.message ?? 'Failed to delete item')
      }

      editorOpen.value = false
      await loadGroups()
    } catch (error) {
      editorError.value = error instanceof Error ? error.message : 'Failed to delete item'
    } finally {
      editorLoading.value = false
    }
  }

  return {
    editorOpen,
    editorLoading,
    editorError,
    editorValues,
    editorItemId,
    editorTitle,
    editorCreateLabel,
    openEditor,
    openCreate,
    saveEditor,
    deleteEditorItem,
  }
}
