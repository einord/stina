<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ToolSettingsListView } from '@stina/extension-api'
import { useApi, type ToolSettingsViewInfo } from '../../composables/useApi.js'
import { useI18n } from '../../composables/useI18n.js'
import EntityList from '../common/EntityList.vue'
import FormHeader from '../common/FormHeader.vue'
import Modal from '../common/Modal.vue'
import SimpleButton from '../buttons/SimpleButton.vue'
import TextInput from '../inputs/TextInput.vue'
import HostManagedExtensionForm from '../forms/HostManagedExtensionForm.vue'
import Icon from '../common/Icon.vue'

interface ToolListItem {
  id: string
  label: string
  description?: string
  secondary?: string
  /** Raw value of the groupBy key on this item, if grouping is active. */
  groupValue?: string
  raw: Record<string, unknown>
}

interface ToolListGroup {
  /** Group key value (raw); empty string represents the "Other" bucket. */
  value: string
  /** Display label for the group header. */
  label: string
  items: ToolListItem[]
}

/** Sentinel value used for items that don't have a value on the groupBy key. */
const OTHER_GROUP_VALUE = ''

const props = defineProps<{
  viewInfo: ToolSettingsViewInfo
}>()

const api = useApi()
const { t } = useI18n()

// List state
const listItems = ref<ToolListItem[]>([])
const listLoading = ref(false)
const listError = ref<string | null>(null)
const searchQuery = ref('')

// Modal state
const modalOpen = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const formValues = ref<Record<string, unknown>>({})
const formLoading = ref(false)
const formSaving = ref(false)
const formError = ref<string | null>(null)
const confirmDelete = ref(false)
const selectedItem = ref<ToolListItem | null>(null)

// Computed
const listView = computed(() => props.viewInfo.view as ToolSettingsListView)

const canCreate = computed(() => Boolean(listView.value.upsertToolId))
const canDelete = computed(() => Boolean(listView.value.deleteToolId))

const description = computed(() => {
  if (!props.viewInfo.description) return undefined
  return [props.viewInfo.description]
})

const isGrouped = computed(() => Boolean(listView.value.groupBy))

/**
 * Groups the current `listItems` by `view.groupBy.key`. Groups listed in
 * `groupBy.order` appear first in the given order; remaining groups follow
 * alphabetically. The "Other" bucket (items with no value on the key) is
 * always sorted last. Empty groups are filtered out so search results don't
 * leave empty headers behind.
 */
const groupedItems = computed<ToolListGroup[]>(() => {
  const groupBy = listView.value.groupBy
  if (!groupBy) return []

  const buckets = new Map<string, ToolListItem[]>()
  for (const item of listItems.value) {
    const value = item.groupValue ?? OTHER_GROUP_VALUE
    const existing = buckets.get(value)
    if (existing) {
      existing.push(item)
    } else {
      buckets.set(value, [item])
    }
  }

  const order = groupBy.order ?? []
  const orderedKeys: string[] = []
  const seen = new Set<string>()

  // First, the explicitly ordered groups (skip empty ones)
  for (const key of order) {
    if (buckets.has(key) && !seen.has(key)) {
      orderedKeys.push(key)
      seen.add(key)
    }
  }

  // Then remaining groups alphabetically (excluding the "other" sentinel)
  const remaining = [...buckets.keys()]
    .filter((key) => !seen.has(key) && key !== OTHER_GROUP_VALUE)
    .sort((a, b) => a.localeCompare(b))
  orderedKeys.push(...remaining)

  // Finally, the "Other" bucket — always last
  if (buckets.has(OTHER_GROUP_VALUE) && !seen.has(OTHER_GROUP_VALUE)) {
    orderedKeys.push(OTHER_GROUP_VALUE)
  }

  return orderedKeys.map((value) => {
    const items = buckets.get(value) ?? []
    let label: string
    if (value === OTHER_GROUP_VALUE) {
      // Fall back to "Other" literal if neither labels nor an i18n entry are
      // provided. We don't add a new translation key here to keep the change
      // scoped to this file; extension authors can override via groupBy.labels.
      label = groupBy.labels?.[OTHER_GROUP_VALUE] ?? 'Other'
    } else {
      label = groupBy.labels?.[value] ?? value
    }
    return { value, label, items }
  })
})

const modalTitle = computed(() => {
  if (modalMode.value === 'create') {
    return t('tools.create_title', { name: props.viewInfo.title })
  }
  return t('tools.edit_title', { name: selectedItem.value?.label ?? props.viewInfo.title })
})

// Helper functions
function getListParams(): Record<string, unknown> {
  const params: Record<string, unknown> = { ...(listView.value.listParams ?? {}) }
  const searchParam = listView.value.searchParam ?? 'query'
  const limitParam = listView.value.limitParam ?? 'limit'
  const query = searchQuery.value.trim()

  if (query) {
    params[searchParam] = query
  }

  if (!(limitParam in params)) {
    params[limitParam] = 100
  }

  return params
}

function mapListItems(data: unknown): ToolListItem[] {
  const mapping = listView.value.mapping
  if (!data || typeof data !== 'object') return []

  const record = data as Record<string, unknown>
  const rawItems = record[mapping.itemsKey]
  if (!Array.isArray(rawItems)) return []

  return rawItems
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const raw = item as Record<string, unknown>
      const idValue = raw[mapping.idKey]
      const labelValue = raw[mapping.labelKey]

      if (!idValue || !labelValue) return null

      const nextItem: ToolListItem = {
        id: String(idValue),
        label: String(labelValue),
        raw,
      }

      if (mapping.descriptionKey) {
        const desc = raw[mapping.descriptionKey]
        if (desc !== undefined) {
          nextItem.description = String(desc)
        }
      }

      if (mapping.secondaryKey) {
        const secondary = raw[mapping.secondaryKey]
        if (secondary !== undefined) {
          nextItem.secondary = String(secondary)
        }
      }

      const groupKey = listView.value.groupBy?.key
      if (groupKey) {
        const groupRaw = raw[groupKey]
        nextItem.groupValue =
          groupRaw === undefined || groupRaw === null || groupRaw === ''
            ? OTHER_GROUP_VALUE
            : String(groupRaw)
      }

      return nextItem
    })
    .filter((item): item is ToolListItem => item !== null)
}

function applyFormValues(data: Record<string, unknown>): void {
  formValues.value = { ...data }
}

// Data loading
async function loadList(): Promise<void> {
  listLoading.value = true
  listError.value = null

  try {
    const result = await api.tools.executeTool(
      props.viewInfo.extensionId,
      listView.value.listToolId,
      getListParams()
    )

    if (!result.success) {
      listItems.value = []
      listError.value = result.error ?? 'Failed to load items'
      return
    }

    listItems.value = mapListItems(result.data)
  } catch (error) {
    listError.value = error instanceof Error ? error.message : 'Failed to load items'
  } finally {
    listLoading.value = false
  }
}

// Modal operations
async function openCreateModal(): Promise<void> {
  modalMode.value = 'create'
  selectedItem.value = null
  formValues.value = {}
  formError.value = null
  confirmDelete.value = false
  modalOpen.value = true
}

async function openEditModal(item: ToolListItem): Promise<void> {
  modalMode.value = 'edit'
  selectedItem.value = item
  formError.value = null
  confirmDelete.value = false
  formLoading.value = true

  const idParam = listView.value.idParam ?? 'id'

  try {
    if (listView.value.getToolId) {
      const result = await api.tools.executeTool(
        props.viewInfo.extensionId,
        listView.value.getToolId,
        { [idParam]: item.id }
      )

      if (!result.success) {
        formError.value = result.error ?? 'Failed to load item'
        applyFormValues(item.raw)
      } else if (result.data && typeof result.data === 'object') {
        applyFormValues(result.data as Record<string, unknown>)
      } else {
        applyFormValues(item.raw)
      }
    } else {
      applyFormValues(item.raw)
    }
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Failed to load item'
    applyFormValues(item.raw)
  } finally {
    formLoading.value = false
    modalOpen.value = true
  }
}

async function saveItem(): Promise<void> {
  if (!listView.value.upsertToolId) return

  formSaving.value = true
  formError.value = null

  const params: Record<string, unknown> = { ...formValues.value }
  const idParam = listView.value.idParam ?? 'id'

  if (modalMode.value === 'edit' && selectedItem.value && !(idParam in params)) {
    params[idParam] = selectedItem.value.id
  }

  try {
    const result = await api.tools.executeTool(
      props.viewInfo.extensionId,
      listView.value.upsertToolId,
      params
    )

    if (!result.success) {
      formError.value = result.error ?? 'Failed to save item'
      return
    }

    modalOpen.value = false
    await loadList()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Failed to save item'
  } finally {
    formSaving.value = false
  }
}

async function deleteItem(): Promise<void> {
  if (!listView.value.deleteToolId || !selectedItem.value) return

  formSaving.value = true
  formError.value = null

  const idParam = listView.value.idParam ?? 'id'

  try {
    const result = await api.tools.executeTool(
      props.viewInfo.extensionId,
      listView.value.deleteToolId,
      { [idParam]: selectedItem.value.id }
    )

    if (!result.success) {
      formError.value = result.error ?? 'Failed to delete item'
      return
    }

    modalOpen.value = false
    await loadList()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Failed to delete item'
  } finally {
    formSaving.value = false
    confirmDelete.value = false
  }
}

// Watchers
watch(
  () => searchQuery.value,
  () => {
    void loadList()
  }
)

watch(
  () => modalOpen.value,
  (open) => {
    if (!open) {
      formError.value = null
      confirmDelete.value = false
    }
  }
)

watch(
  () => props.viewInfo,
  () => {
    void loadList()
  },
  { immediate: true }
)
</script>

<template>
  <div class="tools-view-list">
    <EntityList
      v-if="!isGrouped"
      :title="viewInfo.title"
      :description="description"
      :child-items="listItems"
      :loading="listLoading"
      :error="listError ?? undefined"
      :empty-text="$t('tools.no_items')"
    >
      <template #loading>
        {{ $t('common.loading') }}
      </template>
      <template #actions>
        <div class="toolbar">
          <TextInput v-model="searchQuery" :placeholder="$t('tools.search_placeholder')" />
          <SimpleButton v-if="canCreate" type="primary" @click="openCreateModal">
            <Icon name="plus" />
            {{ $t('tools.create') }}
          </SimpleButton>
        </div>
      </template>
      <template #default="{ item }">
        <div class="tool-item" @click="openEditModal(item)">
          <div class="details">
            <div class="title">{{ item.label }}</div>
            <div v-if="item.secondary || item.description" class="meta">
              <span v-if="item.secondary" class="secondary">{{ item.secondary }}</span>
              <span v-if="item.description" class="description">{{ item.description }}</span>
            </div>
          </div>
          <Icon name="arrow-right" class="chevron" />
        </div>
      </template>
    </EntityList>

    <!--
      Grouped rendering: the header/toolbar live above all groups, then each
      non-empty group is rendered as its own EntityList with the group label
      as the title. This reuses existing list styling without introducing new
      visual primitives.
    -->
    <div v-else class="grouped-list">
      <FormHeader :title="viewInfo.title" :description="description">
        <div class="toolbar">
          <TextInput v-model="searchQuery" :placeholder="$t('tools.search_placeholder')" />
          <SimpleButton v-if="canCreate" type="primary" @click="openCreateModal">
            <Icon name="plus" />
            {{ $t('tools.create') }}
          </SimpleButton>
        </div>
      </FormHeader>

      <p v-if="listLoading" class="status muted">{{ $t('common.loading') }}</p>
      <p v-else-if="listError" class="status error">{{ listError }}</p>
      <p v-else-if="groupedItems.length === 0" class="status muted">
        {{ $t('tools.no_items') }}
      </p>

      <div
        v-for="group in groupedItems"
        :key="group.value"
        class="group"
      >
        <h3 class="group-title">{{ group.label }}</h3>
        <ul class="list">
          <li
            v-for="(item, index) in group.items"
            :key="`${group.value}::${item.id}::${index}`"
            class="item"
          >
            <div class="tool-item" @click="openEditModal(item)">
              <div class="details">
                <div class="title">{{ item.label }}</div>
                <div v-if="item.secondary || item.description" class="meta">
                  <span v-if="item.secondary" class="secondary">{{ item.secondary }}</span>
                  <span v-if="item.description" class="description">{{ item.description }}</span>
                </div>
              </div>
              <Icon name="arrow-right" class="chevron" />
            </div>
          </li>
        </ul>
      </div>
    </div>

    <Modal
      v-model="modalOpen"
      :title="modalTitle"
      :close-label="$t('common.close')"
      max-width="520px"
    >
      <div class="tool-modal">
        <div v-if="formError" class="form-error">{{ formError }}</div>
        <div v-if="formLoading" class="form-loading">
          <Icon name="loading-03" class="spin" />
          {{ $t('common.loading') }}
        </div>
        <HostManagedExtensionForm
          v-else-if="listView.editView"
          v-model="formValues"
          :tree="listView.editView.content"
          scope-key="item"
        />
        <div v-else class="form-error">
          {{ $t('tools.no_edit_view') }}
        </div>

        <div class="actions">
          <SimpleButton type="primary" :disabled="formSaving || formLoading" @click="saveItem">
            {{ $t('common.save') }}
          </SimpleButton>
          <SimpleButton :disabled="formSaving || formLoading" @click="modalOpen = false">
            {{ $t('common.cancel') }}
          </SimpleButton>
        </div>

        <div v-if="modalMode === 'edit' && canDelete" class="danger-zone">
          <h4 class="danger-title">{{ $t('tools.delete_title') }}</h4>
          <p class="danger-description">{{ $t('tools.delete_description') }}</p>
          <SimpleButton
            v-if="!confirmDelete"
            type="danger"
            :disabled="formSaving || formLoading"
            @click="confirmDelete = true"
          >
            {{ $t('tools.delete') }}
          </SimpleButton>
          <SimpleButton
            v-else
            type="danger"
            :disabled="formSaving || formLoading"
            @click="deleteItem"
          >
            {{ $t('tools.delete_confirm') }}
          </SimpleButton>
        </div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.tools-view-list {
  display: flex;
  flex-direction: column;

  :deep(.toolbar) {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 18rem;

    > .text-input {
      min-width: 12rem;
    }
  }

  :deep(.tool-item) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    cursor: pointer;

    > .details {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;

      > .title {
        font-weight: 600;
        color: var(--theme-general-color);
      }

      > .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        font-size: 0.8125rem;
        color: var(--theme-general-color-muted);

        > .secondary {
          font-weight: 500;
        }

        > .description {
          opacity: 0.9;
        }
      }
    }

    > .chevron {
      color: var(--theme-general-color-muted);
      font-size: 1rem;
    }
  }
}

.grouped-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;

  > .toolbar,
  :deep(.toolbar) {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 18rem;
  }

  > .status {
    margin: 0;
    color: var(--muted);

    &.error {
      color: #c44c4c;
    }
  }

  > .group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    /* Discreet spacing between groups; the FormHeader above already gives
       breathing room before the first group. */
    &:not(:first-of-type) {
      margin-top: 1rem;
    }

    > .group-title {
      margin: 0;
      font-size: 0.8125rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--theme-general-color-muted, var(--muted));
    }

    > .list {
      display: flex;
      flex-direction: column;
      padding: 0;
      margin: 0;

      > .item {
        list-style: none;
        margin: -2px 0 0 0;
        padding: 1rem;
        border: 1px solid var(--theme-general-border-color);
        transition: border-color 0.15s ease;
        border-radius: 0;

        &:first-of-type {
          border-top-left-radius: var(--border-radius-normal);
          border-top-right-radius: var(--border-radius-normal);
        }

        &:last-of-type {
          border-bottom-left-radius: var(--border-radius-normal);
          border-bottom-right-radius: var(--border-radius-normal);
        }
      }
    }

    .tool-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      cursor: pointer;

      > .details {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;

        > .title {
          font-weight: 600;
          color: var(--theme-general-color);
        }

        > .meta {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          font-size: 0.8125rem;
          color: var(--theme-general-color-muted);

          > .secondary {
            font-weight: 500;
          }

          > .description {
            opacity: 0.9;
          }
        }
      }

      > .chevron {
        color: var(--theme-general-color-muted);
        font-size: 1rem;
      }
    }
  }
}

.tool-modal {
  display: flex;
  flex-direction: column;
  gap: 1rem;

  > .form-error {
    color: var(--theme-general-color-danger, #dc2626);
    font-size: 0.875rem;
  }

  > .form-loading {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--theme-general-color-muted);
    padding: 1rem 0;
  }

  > .actions {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  > .danger-zone {
    padding-top: 1rem;
    border-top: 1px solid var(--theme-general-border-color);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    > .danger-title {
      margin: 0;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--theme-general-color-danger, #dc2626);
    }

    > .danger-description {
      margin: 0;
      font-size: 0.8125rem;
      color: var(--theme-general-color-muted);
    }
  }
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
