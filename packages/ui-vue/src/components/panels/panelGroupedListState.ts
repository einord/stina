import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useApi } from '../../composables/useApi.js'
import { useExtensionEvents } from '../../composables/useExtensionEvents.js'
import type { PanelViewInfo } from '../../composables/useApi.js'
import type {
  PanelGroupedListView,
  PanelToolAction,
  PanelValue,
  SettingDefinition,
} from '@stina/extension-api'
import type { PanelGroupedListRecord } from './panelGroupedListTypes.js'

type UnknownRecord = PanelGroupedListRecord

export function usePanelGroupedListState(panel: PanelViewInfo) {
  const api = useApi()
  const extensionEvents = useExtensionEvents()
  const view = computed(() => panel.view as PanelGroupedListView)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const groups = ref<UnknownRecord[]>([])
  const expandedItems = ref<Set<string>>(new Set())
  const commentDrafts = ref<Record<string, string>>({})
  const subItemDrafts = ref<Record<string, string>>({})
  const actionBusy = ref<Record<string, boolean>>({})
  const editorOpen = ref(false)
  const editorLoading = ref(false)
  const editorError = ref<string | null>(null)
  const editorValues = ref<Record<string, unknown>>({})
  const editorItemId = ref<string | null>(null)
  const editorTitle = ref<string>('Edit item')
  const editorCreateLabel = ref<string>('New item')

  let stopEvents: (() => void) | null = null

  const getValue = (target: unknown, path: string): unknown => {
    if (!target || typeof target !== 'object') return undefined
    if (!path.includes('.')) {
      return (target as UnknownRecord)[path]
    }
    return path.split('.').reduce<unknown>((acc, key) => {
      if (!acc || typeof acc !== 'object') return undefined
      return (acc as UnknownRecord)[key]
    }, target)
  }

  const resolveValue = (value: PanelValue, context: UnknownRecord): unknown => {
    if (value && typeof value === 'object' && 'ref' in value) {
      return getValue(context, value.ref)
    }
    return value
  }

  const resolveParams = (
    params: Record<string, PanelValue> | undefined,
    context: UnknownRecord
  ) => {
    if (!params) return {}
    return Object.fromEntries(
      Object.entries(params).map(([key, value]) => [key, resolveValue(value, context)])
    )
  }

  const applyCreateDefaults = (
    defaults: Record<string, PanelValue> | undefined,
    context: UnknownRecord
  ) => {
    if (!defaults) return
    const resolved = resolveParams(defaults, context)
    editorValues.value = { ...editorValues.value, ...resolved }
  }

  const buildDefaultValues = (fields: SettingDefinition[] | undefined): Record<string, unknown> => {
    const values: Record<string, unknown> = {}
    if (!fields) return values

    for (const field of fields) {
      if (field.default !== undefined) {
        values[field.id] = field.default
      }
    }

    return values
  }

  const applyFormValues = (
    fields: SettingDefinition[] | undefined,
    data: Record<string, unknown>
  ): void => {
    const base = buildDefaultValues(fields)
    const nextValues: Record<string, unknown> = { ...base }

    if (fields) {
      for (const field of fields) {
        if (field.id in data) {
          const value = data[field.id]
          nextValues[field.id] = field.type === 'select' && value === null ? '' : value
        }
      }
    }

    editorValues.value = nextValues
  }

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

  const getGroupId = (group: UnknownRecord): string => {
    const value = getValue(group, view.value.group.idKey)
    return value ? String(value) : ''
  }

  const getGroupTitle = (group: UnknownRecord): string => {
    const value = getValue(group, view.value.group.titleKey)
    return value ? String(value) : view.value.group.emptyLabel ?? 'Untitled'
  }

  const getGroupItems = (group: UnknownRecord): UnknownRecord[] => {
    const value = getValue(group, view.value.group.itemsKey)
    return Array.isArray(value) ? (value as UnknownRecord[]) : []
  }

  const isGroupCollapsed = (group: UnknownRecord): boolean => {
    if (!view.value.group.collapsedKey) return false
    return Boolean(getValue(group, view.value.group.collapsedKey))
  }

  const toggleGroup = async (group: UnknownRecord) => {
    const collapsedKey = view.value.group.collapsedKey
    if (!collapsedKey) return

    const current = Boolean(getValue(group, collapsedKey))
    const next = !current
    const action = view.value.actions?.toggleGroup

    if (action) {
      await runAction(action, { group, state: { collapsed: next } })
      await loadGroups()
      return
    }

    group[collapsedKey] = next
  }

  const getItemId = (item: UnknownRecord): string => {
    const value = getValue(item, view.value.item.idKey)
    return value ? String(value) : ''
  }

  const getItemKey = (group: UnknownRecord, item: UnknownRecord): string => {
    const groupId = getGroupId(group)
    const itemId = getItemId(item)
    return groupId ? `${groupId}:${itemId}` : itemId
  }

  const getItemTitle = (item: UnknownRecord): string => {
    const value = getValue(item, view.value.item.titleKey)
    return value ? String(value) : 'Untitled'
  }

  const getItemDescription = (item: UnknownRecord): string => {
    if (!view.value.item.descriptionKey) return ''
    const value = getValue(item, view.value.item.descriptionKey)
    return value ? String(value) : ''
  }

  const getItemIcon = (item: UnknownRecord): string | null => {
    if (!view.value.item.iconKey) return null
    const value = getValue(item, view.value.item.iconKey)
    return value ? String(value) : null
  }

  const getItemStatus = (item: UnknownRecord): string | null => {
    if (!view.value.item.statusKey) return null
    const value = getValue(item, view.value.item.statusKey)
    return value ? String(value) : null
  }

  const getItemDate = (item: UnknownRecord): string | null => {
    if (!view.value.item.dateKey) return null
    const value = getValue(item, view.value.item.dateKey)
    return value ? String(value) : null
  }

  const getItemTime = (item: UnknownRecord): string | null => {
    if (!view.value.item.timeKey) return null
    const value = getValue(item, view.value.item.timeKey)
    return value ? String(value) : null
  }

  const getItemCommentCount = (item: UnknownRecord): number | null => {
    if (view.value.item.commentCountKey) {
      const value = getValue(item, view.value.item.commentCountKey)
      return typeof value === 'number' ? value : value ? Number(value) : 0
    }
    if (view.value.item.comments) {
      const comments = getItemComments(item)
      return comments.length
    }
    return null
  }

  const getItemComments = (item: UnknownRecord): UnknownRecord[] => {
    const config = view.value.item.comments
    if (!config) return []
    const value = getValue(item, config.itemsKey)
    return Array.isArray(value) ? (value as UnknownRecord[]) : []
  }

  const getCommentText = (comment: UnknownRecord): string => {
    const config = view.value.item.comments
    if (!config) return ''
    const value = getValue(comment, config.textKey)
    return value ? String(value) : ''
  }

  const getCommentDate = (comment: UnknownRecord): string => {
    const config = view.value.item.comments
    if (!config?.createdAtKey) return ''
    const value = getValue(comment, config.createdAtKey)
    return value ? String(value) : ''
  }

  const getCommentId = (comment: UnknownRecord): string => {
    const config = view.value.item.comments
    if (!config?.idKey) return ''
    const value = getValue(comment, config.idKey)
    return value ? String(value) : ''
  }

  const getSubItems = (item: UnknownRecord): UnknownRecord[] => {
    const config = view.value.item.subItems
    if (!config) return []
    const value = getValue(item, config.itemsKey)
    return Array.isArray(value) ? (value as UnknownRecord[]) : []
  }

  const getSubItemId = (subItem: UnknownRecord): string => {
    const config = view.value.item.subItems
    if (!config?.idKey) return ''
    const value = getValue(subItem, config.idKey)
    return value ? String(value) : ''
  }

  const getSubItemText = (subItem: UnknownRecord): string => {
    const config = view.value.item.subItems
    if (!config) return ''
    const value = getValue(subItem, config.textKey)
    return value ? String(value) : ''
  }

  const isSubItemCompleted = (subItem: UnknownRecord): boolean => {
    const config = view.value.item.subItems
    if (!config?.completedAtKey) return false
    return Boolean(getValue(subItem, config.completedAtKey))
  }

  const getDraftValue = (store: Record<string, string>, key: string): string =>
    store[key] ?? ''

  const setDraftValue = (store: Record<string, string>, key: string, value: string): void => {
    store[key] = value
  }

  const isActionBusy = (key: string): boolean => Boolean(actionBusy.value[key])

  const setActionBusy = (key: string, busy: boolean): void => {
    actionBusy.value[key] = busy
  }

  const getCommentDraft = (group: UnknownRecord, item: UnknownRecord): string =>
    getDraftValue(commentDrafts.value, getItemKey(group, item))

  const setCommentDraft = (group: UnknownRecord, item: UnknownRecord, value: string): void => {
    setDraftValue(commentDrafts.value, getItemKey(group, item), value)
  }

  const getSubItemDraft = (group: UnknownRecord, item: UnknownRecord): string =>
    getDraftValue(subItemDrafts.value, getItemKey(group, item))

  const setSubItemDraft = (group: UnknownRecord, item: UnknownRecord, value: string): void => {
    setDraftValue(subItemDrafts.value, getItemKey(group, item), value)
  }

  const hasItemDetails = (item: UnknownRecord): boolean => {
    if (getItemDescription(item)) return true
    if (getSubItems(item).length > 0) return true
    if (view.value.item.subItems?.actions?.add) return true
    if (getItemComments(item).length > 0) return true
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
    const itemKey = getItemKey(group, item)
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
    const itemKey = getItemKey(group, item)
    const subItemId = getSubItemId(subItem)
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
    const itemKey = getItemKey(group, item)
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
    const itemKey = getItemKey(group, item)
    const commentId = getCommentId(comment)
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

  const openEditor = async (item: UnknownRecord) => {
    const editor = view.value.editor
    if (!editor) return

    editorLoading.value = true
    editorError.value = null
    editorOpen.value = true
    editorValues.value = buildDefaultValues(editor.fields)

    const itemId = getItemId(item)
    editorItemId.value = itemId || null
    editorTitle.value = editor.title ?? `Edit ${getItemTitle(item)}`
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
        applyFormValues(editor.fields, data)
      } else {
        applyFormValues(editor.fields, item)
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
    applyCreateDefaults(editor.createDefaults, {})
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
    panel,
    view,
    loading,
    error,
    groups,
    expandedItems,
    commentDrafts,
    subItemDrafts,
    actionBusy,
    editorOpen,
    editorLoading,
    editorError,
    editorValues,
    editorItemId,
    editorTitle,
    editorCreateLabel,
    loadGroups,
    getGroupId,
    getGroupTitle,
    getGroupItems,
    isGroupCollapsed,
    toggleGroup,
    getItemKey,
    getItemTitle,
    getItemDescription,
    getItemIcon,
    getItemStatus,
    getItemDate,
    getItemTime,
    getItemCommentCount,
    getItemComments,
    getCommentText,
    getCommentDate,
    getCommentId,
    getSubItems,
    getSubItemId,
    getSubItemText,
    isSubItemCompleted,
    getCommentDraft,
    setCommentDraft,
    getSubItemDraft,
    setSubItemDraft,
    isActionBusy,
    hasItemDetails,
    toggleItemExpanded,
    onToggleSubItem,
    onAddSubItem,
    onDeleteSubItem,
    onAddComment,
    onDeleteComment,
    onEditItem,
    openCreate,
    saveEditor,
    deleteEditorItem,
  }
}

export type PanelGroupedListState = ReturnType<typeof usePanelGroupedListState>
