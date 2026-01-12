import { ref, type Ref } from 'vue'
import type { PanelGroupedListView, PanelToolAction, PanelValue } from '@stina/extension-api'
import type { ApiClient, PanelViewInfo } from '../../composables/useApi.js'
import type { PanelGroupedListRecord } from './panelGroupedList.Types.js'
import type { PanelGroupedListAccessors } from './panelGroupedList.Accessors.js'

type UnknownRecord = PanelGroupedListRecord

export interface PanelGroupedListActionsOptions {
  panel: PanelViewInfo
  view: Ref<PanelGroupedListView>
  api: ApiClient
  accessors: PanelGroupedListAccessors
  loadGroups: () => Promise<void>
  error: Ref<string | null>
  resolveParams: (
    params: Record<string, PanelValue> | undefined,
    context: UnknownRecord
  ) => Record<string, unknown>
  openEditor: (item: UnknownRecord) => Promise<void>
}

export function usePanelGroupedListActions(options: PanelGroupedListActionsOptions) {
  const { panel, view, api, accessors, loadGroups, error, resolveParams, openEditor } = options
  const expandedItems = ref<Set<string>>(new Set())
  const commentDrafts = ref<Record<string, string>>({})
  const subItemDrafts = ref<Record<string, string>>({})
  const actionBusy = ref<Record<string, boolean>>({})

  const getDraftValue = (store: Record<string, string>, key: string): string => store[key] ?? ''

  const setDraftValue = (store: Record<string, string>, key: string, value: string): void => {
    store[key] = value
  }

  const isActionBusy = (key: string): boolean => Boolean(actionBusy.value[key])

  const setActionBusy = (key: string, busy: boolean): void => {
    actionBusy.value[key] = busy
  }

  const getCommentDraft = (group: UnknownRecord, item: UnknownRecord): string =>
    getDraftValue(commentDrafts.value, accessors.getItemKey(group, item))

  const setCommentDraft = (group: UnknownRecord, item: UnknownRecord, value: string): void => {
    setDraftValue(commentDrafts.value, accessors.getItemKey(group, item), value)
  }

  const getSubItemDraft = (group: UnknownRecord, item: UnknownRecord): string =>
    getDraftValue(subItemDrafts.value, accessors.getItemKey(group, item))

  const setSubItemDraft = (group: UnknownRecord, item: UnknownRecord, value: string): void => {
    setDraftValue(subItemDrafts.value, accessors.getItemKey(group, item), value)
  }

  const hasItemDetails = (item: UnknownRecord): boolean => {
    if (accessors.getItemDescription(item)) return true
    if (accessors.getSubItems(item).length > 0) return true
    if (view.value.item.subItems?.actions?.add) return true
    if (accessors.getItemComments(item).length > 0) return true
    if (view.value.item.comments?.actions?.add) return true
    if (view.value.editor) return true
    if (view.value.actions?.editItem) return true
    return false
  }

  const toggleItemExpanded = (itemKey: string) => {
    if (expandedItems.value.has(itemKey)) {
      expandedItems.value.delete(itemKey)
    } else {
      expandedItems.value.add(itemKey)
    }
  }

  const runAction = async (action: PanelToolAction, context: UnknownRecord) => {
    const params = resolveParams(action.params, context)
    const result = await api.tools.executeTool(panel.extensionId, action.toolId, params)

    if (!result.success) {
      error.value = result.error ?? result.message ?? 'Failed to execute action'
    }
  }

  const toggleGroup = async (group: UnknownRecord) => {
    const collapsedKey = view.value.group.collapsedKey
    if (!collapsedKey) return

    const current = accessors.isGroupCollapsed(group)
    const next = !current
    const action = view.value.actions?.toggleGroup

    if (action) {
      await runAction(action, { group, state: { collapsed: next } })
      await loadGroups()
      return
    }

    group[collapsedKey] = next
  }

  const onToggleSubItem = async (
    group: UnknownRecord,
    item: UnknownRecord,
    subItem: UnknownRecord
  ) => {
    const action = view.value.actions?.toggleSubItem
    if (!action) return
    await runAction(action, { group, item, subItem })
    await loadGroups()
  }

  const onAddSubItem = async (group: UnknownRecord, item: UnknownRecord) => {
    const action = view.value.item.subItems?.actions?.add
    if (!action) return
    const itemKey = accessors.getItemKey(group, item)
    const draft = getDraftValue(subItemDrafts.value, itemKey).trim()
    if (!draft) return

    const busyKey = `subitem-add:${itemKey}`
    setActionBusy(busyKey, true)

    try {
      await runAction(action, { group, item, state: { subItemText: draft } })
      setDraftValue(subItemDrafts.value, itemKey, '')
      await loadGroups()
    } finally {
      setActionBusy(busyKey, false)
    }
  }

  const onDeleteSubItem = async (
    group: UnknownRecord,
    item: UnknownRecord,
    subItem: UnknownRecord
  ) => {
    const action = view.value.item.subItems?.actions?.delete
    if (!action) return
    const itemKey = accessors.getItemKey(group, item)
    const subItemId = accessors.getSubItemId(subItem)
    if (!subItemId) return

    const busyKey = `subitem-delete:${itemKey}:${subItemId}`
    setActionBusy(busyKey, true)

    try {
      await runAction(action, { group, item, subItem })
      await loadGroups()
    } finally {
      setActionBusy(busyKey, false)
    }
  }

  const onAddComment = async (group: UnknownRecord, item: UnknownRecord) => {
    const action = view.value.item.comments?.actions?.add
    if (!action) return
    const itemKey = accessors.getItemKey(group, item)
    const draft = getDraftValue(commentDrafts.value, itemKey).trim()
    if (!draft) return

    const busyKey = `comment-add:${itemKey}`
    setActionBusy(busyKey, true)

    try {
      await runAction(action, { group, item, state: { commentText: draft } })
      setDraftValue(commentDrafts.value, itemKey, '')
      await loadGroups()
    } finally {
      setActionBusy(busyKey, false)
    }
  }

  const onDeleteComment = async (
    group: UnknownRecord,
    item: UnknownRecord,
    comment: UnknownRecord
  ) => {
    const action = view.value.item.comments?.actions?.delete
    if (!action) return
    const itemKey = accessors.getItemKey(group, item)
    const commentId = accessors.getCommentId(comment)
    if (!commentId) return

    const busyKey = `comment-delete:${itemKey}:${commentId}`
    setActionBusy(busyKey, true)

    try {
      await runAction(action, { group, item, comment })
      await loadGroups()
    } finally {
      setActionBusy(busyKey, false)
    }
  }

  const onEditItem = async (group: UnknownRecord, item: UnknownRecord) => {
    const editor = view.value.editor
    if (editor) {
      await openEditor(item)
      return
    }
    const action = view.value.actions?.editItem
    if (!action) return
    await runAction(action, { group, item })
    await loadGroups()
  }

  return {
    expandedItems,
    commentDrafts,
    subItemDrafts,
    actionBusy,
    getCommentDraft,
    setCommentDraft,
    getSubItemDraft,
    setSubItemDraft,
    isActionBusy,
    hasItemDetails,
    toggleItemExpanded,
    toggleGroup,
    onToggleSubItem,
    onAddSubItem,
    onDeleteSubItem,
    onAddComment,
    onDeleteComment,
    onEditItem,
  }
}
