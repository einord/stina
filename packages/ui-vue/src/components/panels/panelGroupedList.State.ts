import { computed } from 'vue'
import { useApi, type PanelViewInfo } from '../../composables/useApi.js'
import { useExtensionEvents } from '../../composables/useExtensionEvents.js'
import type { PanelGroupedListView } from '@stina/extension-api'
import { createPanelGroupedListAccessors } from './panelGroupedList.Accessors.js'
import { usePanelGroupedListData } from './panelGroupedList.Data.js'
import { usePanelGroupedListEditor } from './panelGroupedList.Editor.js'
import { usePanelGroupedListActions } from './panelGroupedList.Actions.js'
import {
  applyCreateDefaults,
  buildDefaultValues,
  buildFormValues,
  getValue,
  resolveParams,
} from './panelGroupedList.Helpers.js'

export function usePanelGroupedListState(panel: PanelViewInfo) {
  const api = useApi()
  const extensionEvents = useExtensionEvents()
  const view = computed(() => panel.view as PanelGroupedListView)

  const accessors = createPanelGroupedListAccessors(view)
  const dataState = usePanelGroupedListData({
    panel,
    view,
    api,
    extensionEvents,
    resolveParams,
    getValue,
  })
  const editorState = usePanelGroupedListEditor({
    panel,
    view,
    api,
    accessors,
    loadGroups: dataState.loadGroups,
    buildDefaultValues,
    buildFormValues,
    applyCreateDefaults,
  })
  const actionsState = usePanelGroupedListActions({
    panel,
    view,
    api,
    accessors,
    loadGroups: dataState.loadGroups,
    error: dataState.error,
    resolveParams,
    openEditor: editorState.openEditor,
  })

  return {
    panel,
    view,
    ...dataState,
    ...accessors,
    ...actionsState,
    ...editorState,
  }
}

export type PanelGroupedListState = ReturnType<typeof usePanelGroupedListState>
