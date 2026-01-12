import type { Ref } from 'vue'
import type { PanelGroupedListView } from '@stina/extension-api'
import type { PanelGroupedListRecord } from './panelGroupedList.Types.js'
import { getValue } from './panelGroupedList.Helpers.js'

type UnknownRecord = PanelGroupedListRecord

export interface PanelGroupedListAccessors {
  getGroupId: (group: UnknownRecord) => string
  getGroupTitle: (group: UnknownRecord) => string
  getGroupItems: (group: UnknownRecord) => UnknownRecord[]
  isGroupCollapsed: (group: UnknownRecord) => boolean
  getItemId: (item: UnknownRecord) => string
  getItemKey: (group: UnknownRecord, item: UnknownRecord) => string
  getItemTitle: (item: UnknownRecord) => string
  getItemDescription: (item: UnknownRecord) => string
  getItemIcon: (item: UnknownRecord) => string | null
  getItemStatus: (item: UnknownRecord) => string | null
  getItemDate: (item: UnknownRecord) => string | null
  getItemTime: (item: UnknownRecord) => string | null
  getItemCommentCount: (item: UnknownRecord) => number | null
  getItemComments: (item: UnknownRecord) => UnknownRecord[]
  getCommentText: (comment: UnknownRecord) => string
  getCommentDate: (comment: UnknownRecord) => string
  getCommentId: (comment: UnknownRecord) => string
  getSubItems: (item: UnknownRecord) => UnknownRecord[]
  getSubItemId: (subItem: UnknownRecord) => string
  getSubItemText: (subItem: UnknownRecord) => string
  isSubItemCompleted: (subItem: UnknownRecord) => boolean
}

export function createPanelGroupedListAccessors(
  view: Ref<PanelGroupedListView>
): PanelGroupedListAccessors {
  const getGroupId = (group: UnknownRecord): string => {
    const value = getValue(group, view.value.group.idKey)
    return value ? String(value) : ''
  }

  const getGroupTitle = (group: UnknownRecord): string => {
    const value = getValue(group, view.value.group.titleKey)
    return value ? String(value) : (view.value.group.emptyLabel ?? 'Untitled')
  }

  const getGroupItems = (group: UnknownRecord): UnknownRecord[] => {
    const value = getValue(group, view.value.group.itemsKey)
    return Array.isArray(value) ? (value as UnknownRecord[]) : []
  }

  const isGroupCollapsed = (group: UnknownRecord): boolean => {
    if (!view.value.group.collapsedKey) return false
    return Boolean(getValue(group, view.value.group.collapsedKey))
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

  return {
    getGroupId,
    getGroupTitle,
    getGroupItems,
    isGroupCollapsed,
    getItemId,
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
  }
}
