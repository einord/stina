<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Icon from '../common/Icon.vue'
import { useApi } from '../../composables/useApi.js'
import type { PanelViewInfo } from '../../composables/useApi.js'
import type { PanelGroupedListView, PanelToolAction, PanelValue } from '@stina/extension-api'

type UnknownRecord = Record<string, unknown>

const props = defineProps<{
  panel: PanelViewInfo
}>()

const api = useApi()
const view = computed(() => props.panel.view as PanelGroupedListView)
const loading = ref(false)
const error = ref<string | null>(null)
const groups = ref<UnknownRecord[]>([])
const expandedItems = ref<Set<string>>(new Set())

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

const resolveParams = (params: Record<string, PanelValue> | undefined, context: UnknownRecord) => {
  if (!params) return {}
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, resolveValue(value, context)])
  )
}

const loadGroups = async (): Promise<void> => {
  loading.value = true
  error.value = null

  try {
    const result = await api.tools.executeTool(
      props.panel.extensionId,
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

const getSubItems = (item: UnknownRecord): UnknownRecord[] => {
  const config = view.value.item.subItems
  if (!config) return []
  const value = getValue(item, config.itemsKey)
  return Array.isArray(value) ? (value as UnknownRecord[]) : []
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

const hasItemDetails = (item: UnknownRecord): boolean => {
  if (getItemDescription(item)) return true
  if (getSubItems(item).length > 0) return true
  if (getItemComments(item).length > 0) return true
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
  const result = await api.tools.executeTool(
    props.panel.extensionId,
    action.toolId,
    params
  )

  if (!result.success) {
    error.value = result.error ?? result.message ?? 'Failed to execute action'
  }
}

const onToggleSubItem = async (group: UnknownRecord, item: UnknownRecord, subItem: UnknownRecord) => {
  const action = view.value.actions?.toggleSubItem
  if (!action) return
  await runAction(action, { group, item, subItem })
  await loadGroups()
}

const onEditItem = async (group: UnknownRecord, item: UnknownRecord) => {
  const action = view.value.actions?.editItem
  if (!action) return
  await runAction(action, { group, item })
  await loadGroups()
}

onMounted(() => {
  void loadGroups()

  const refreshEvents = view.value.data.refreshEvents ?? []
  if (refreshEvents.length === 0) return

  const refreshSet = new Set(refreshEvents)
  stopEvents = api.events.subscribe((event) => {
    if (event.extensionId !== props.panel.extensionId) return
    if (!refreshSet.has(event.name)) return
    void loadGroups()
  })
})

onBeforeUnmount(() => {
  stopEvents?.()
})
</script>

<template>
  <div class="grouped-list">
    <div v-if="loading" class="state">Loading items...</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <div v-else-if="groups.length === 0" class="state">No items available.</div>
    <div v-else class="groups">
      <section v-for="group in groups" :key="getGroupId(group)" class="group">
        <button
          class="group-header"
          type="button"
          :disabled="!view.group.collapsedKey"
          @click="toggleGroup(group)"
        >
          <Icon
            v-if="view.group.collapsedKey"
            class="chevron"
            name="chevron-right"
            :class="{ open: !isGroupCollapsed(group) }"
          />
          <span class="title">{{ getGroupTitle(group) }}</span>
          <span class="count">{{ getGroupItems(group).length }}</span>
        </button>
        <div v-if="!isGroupCollapsed(group)" class="group-body">
          <div v-if="getGroupItems(group).length === 0" class="group-empty">
            {{ view.group.emptyLabel ?? 'No items' }}
          </div>
          <div v-else class="items">
            <article
              v-for="item in getGroupItems(group)"
              :key="getItemKey(group, item)"
              class="item"
            >
              <button
                class="item-row"
                type="button"
                @click="hasItemDetails(item) && toggleItemExpanded(getItemKey(group, item))"
              >
                <Icon v-if="getItemIcon(item)" class="item-icon" :name="getItemIcon(item) ?? ''" />
                <div class="item-main">
                  <div class="item-title">
                    <span>{{ getItemTitle(item) }}</span>
                    <span v-if="getItemStatus(item)" class="status">{{ getItemStatus(item) }}</span>
                  </div>
                  <div class="item-meta">
                    <span v-if="getItemDate(item) || getItemTime(item)" class="datetime">
                      {{ getItemDate(item) }} {{ getItemTime(item) }}
                    </span>
                    <span v-if="getItemCommentCount(item) !== null" class="comments">
                      <Icon class="comment-icon" name="chat-bubble" />
                      {{ getItemCommentCount(item) }}
                    </span>
                  </div>
                </div>
                <Icon
                  v-if="hasItemDetails(item)"
                  class="expand-icon"
                  name="chevron-right"
                  :class="{ open: expandedItems.has(getItemKey(group, item)) }"
                />
              </button>
              <div
                v-if="hasItemDetails(item) && expandedItems.has(getItemKey(group, item))"
                class="item-details"
              >
                <p v-if="getItemDescription(item)" class="description">
                  {{ getItemDescription(item) }}
                </p>
                <div v-if="getSubItems(item).length > 0" class="subitems">
                  <div
                    v-for="subItem in getSubItems(item)"
                    :key="String(subItem[view.item.subItems?.idKey ?? 'id'])"
                    class="subitem"
                  >
                    <button
                      class="subitem-toggle"
                      type="button"
                      @click="onToggleSubItem(group, item, subItem)"
                    >
                      <Icon
                        class="subitem-icon"
                        :name="isSubItemCompleted(subItem) ? 'check-circle' : 'circle'"
                      />
                    </button>
                    <span :class="{ done: isSubItemCompleted(subItem) }">
                      {{ getSubItemText(subItem) }}
                    </span>
                  </div>
                </div>
                <div v-if="getItemComments(item).length > 0" class="comments-list">
                  <div v-for="comment in getItemComments(item)" :key="getCommentText(comment)" class="comment">
                    <span v-if="getCommentDate(comment)" class="comment-date">
                      {{ getCommentDate(comment) }}
                    </span>
                    <span class="comment-text">{{ getCommentText(comment) }}</span>
                  </div>
                </div>
                <div v-if="view.actions?.editItem" class="item-actions">
                  <button class="edit-button" type="button" @click="onEditItem(group, item)">
                    Edit
                  </button>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.grouped-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;

  > .state {
    color: var(--theme-general-muted, #6b7280);
    font-size: 0.85rem;

    &.error {
      color: var(--color-danger, #ef4444);
    }
  }

  > .groups {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;

    > .group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      > .group-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        border: none;
        background: transparent;
        padding: 0;
        cursor: pointer;
        color: var(--theme-general-color);

        &:disabled {
          cursor: default;
          opacity: 0.7;
        }

        > .chevron {
          transition: transform 0.2s ease;

          &.open {
            transform: rotate(90deg);
          }
        }

        > .title {
          font-weight: var(--font-weight-medium);
        }

        > .count {
          margin-left: auto;
          font-size: 0.8rem;
          color: var(--theme-general-muted, #6b7280);
        }
      }

      > .group-body {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding-left: 1.25rem;

        > .group-empty {
          color: var(--theme-general-muted, #6b7280);
          font-size: 0.8rem;
        }

        > .items {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;

          > .item {
            border-radius: var(--border-radius-normal);
            border: 1px solid var(--theme-general-border-color);
            background: var(--theme-main-components-main-background);

            > .item-row {
              display: flex;
              align-items: flex-start;
              gap: 0.75rem;
              width: 100%;
              padding: 0.6rem;
              border: none;
              background: transparent;
              text-align: left;
              cursor: pointer;

              > .item-icon {
                font-size: 1.1rem;
                color: var(--theme-general-color);
              }

              > .item-main {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 0.2rem;

                > .item-title {
                  display: flex;
                  align-items: center;
                  gap: 0.5rem;
                  font-size: 0.9rem;
                  font-weight: var(--font-weight-medium);
                  color: var(--theme-general-color);

                  > .status {
                    font-size: 0.7rem;
                    padding: 0.1rem 0.4rem;
                    border-radius: 999px;
                    background: var(--theme-general-border-color);
                    color: var(--theme-general-muted, #6b7280);
                  }
                }

                > .item-meta {
                  display: flex;
                  align-items: center;
                  gap: 0.75rem;
                  font-size: 0.75rem;
                  color: var(--theme-general-muted, #6b7280);

                  > .comments {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.3rem;

                    > .comment-icon {
                      font-size: 0.85rem;
                    }
                  }
                }
              }

              > .expand-icon {
                margin-left: auto;
                transition: transform 0.2s ease;

                &.open {
                  transform: rotate(90deg);
                }
              }
            }

            > .item-details {
              border-top: 1px solid var(--theme-general-border-color);
              padding: 0.6rem 0.8rem 0.8rem;
              display: flex;
              flex-direction: column;
              gap: 0.6rem;

              > .description {
                margin: 0;
                color: var(--theme-general-color);
                font-size: 0.85rem;
                line-height: 1.4;
              }

              > .subitems {
                display: flex;
                flex-direction: column;
                gap: 0.4rem;

                > .subitem {
                  display: flex;
                  align-items: center;
                  gap: 0.4rem;
                  font-size: 0.8rem;
                  color: var(--theme-general-color);

                  > .subitem-toggle {
                    border: none;
                    background: transparent;
                    padding: 0;
                    cursor: pointer;

                    > .subitem-icon {
                      font-size: 0.9rem;
                    }
                  }

                  > .done {
                    text-decoration: line-through;
                    color: var(--theme-general-muted, #6b7280);
                  }
                }
              }

              > .comments-list {
                display: flex;
                flex-direction: column;
                gap: 0.4rem;

                > .comment {
                  display: flex;
                  flex-direction: column;
                  gap: 0.2rem;
                  font-size: 0.8rem;
                  color: var(--theme-general-color);

                  > .comment-date {
                    font-size: 0.7rem;
                    color: var(--theme-general-muted, #6b7280);
                  }
                }
              }

              > .item-actions {
                display: flex;
                justify-content: flex-end;

                > .edit-button {
                  border: 1px solid var(--theme-general-border-color);
                  background: transparent;
                  color: var(--theme-general-color);
                  padding: 0.4rem 0.7rem;
                  border-radius: var(--border-radius-normal);
                  cursor: pointer;

                  &:hover {
                    background: var(--theme-general-border-color);
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
</style>
