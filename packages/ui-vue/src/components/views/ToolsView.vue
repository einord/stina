<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { SettingDefinition, ToolSettingsListView } from '@stina/extension-api'
import { useApi, type ToolSettingsViewInfo } from '../../composables/useApi.js'
import { useI18n } from '../../composables/useI18n.js'
import ToolsViewMenu from './ToolsView.Menu.vue'
import EntityList from '../common/EntityList.vue'
import Modal from '../common/Modal.vue'
import SimpleButton from '../buttons/SimpleButton.vue'
import TextInput from '../inputs/TextInput.vue'
import ExtensionSettingsForm from '../common/ExtensionSettingsForm.vue'
import Icon from '../common/Icon.vue'

interface ToolListItem {
  id: string
  label: string
  description?: string
  secondary?: string
  raw: Record<string, unknown>
}

const api = useApi()
const { t } = useI18n()

const views = ref<ToolSettingsViewInfo[]>([])
const currentViewKey = ref<string | null>(null)
const viewsLoading = ref(false)
const viewsError = ref<string | null>(null)

const listItems = ref<ToolListItem[]>([])
const listLoading = ref(false)
const listError = ref<string | null>(null)

const searchQuery = ref('')

const modalOpen = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const formValues = ref<Record<string, unknown>>({})
const formLoading = ref(false)
const formSaving = ref(false)
const formError = ref<string | null>(null)
const confirmDelete = ref(false)
const selectedItem = ref<ToolListItem | null>(null)

const menuItems = computed(() =>
  views.value.map((view) => ({
    id: getViewKey(view),
    title: view.title,
  }))
)

const currentView = computed(
  () => views.value.find((view) => getViewKey(view) === currentViewKey.value) ?? null
)

const currentListView = computed(() => {
  if (!currentView.value) return null
  return currentView.value.view as ToolSettingsListView
})

const canCreate = computed(() => Boolean(currentListView.value?.upsertToolId))
const canDelete = computed(() => Boolean(currentListView.value?.deleteToolId))

const modalTitle = computed(() => {
  if (!currentView.value) return ''
  if (modalMode.value === 'create') {
    return t('tools.create_title', { name: currentView.value.title })
  }
  return t('tools.edit_title', { name: selectedItem.value?.label ?? currentView.value.title })
})

const currentDescription = computed(() => {
  if (!currentView.value) return undefined
  const lines: string[] = []
  if (currentView.value.description) {
    lines.push(currentView.value.description)
  }
  return lines
})

function getViewKey(view: ToolSettingsViewInfo): string {
  return `${view.extensionId}:${view.id}`
}

function getListParams(view: ToolSettingsViewInfo): Record<string, unknown> {
  const listView = view.view as ToolSettingsListView
  const params: Record<string, unknown> = { ...(listView.listParams ?? {}) }

  const searchParam = listView.searchParam ?? 'query'
  const limitParam = listView.limitParam ?? 'limit'
  const query = searchQuery.value.trim()

  if (query) {
    params[searchParam] = query
  }

  if (!(limitParam in params)) {
    params[limitParam] = 100
  }

  return params
}

function mapListItems(view: ToolSettingsViewInfo, data: unknown): ToolListItem[] {
  const listView = view.view as ToolSettingsListView
  const mapping = listView.mapping
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
        const description = raw[mapping.descriptionKey]
        if (description !== undefined) {
          nextItem.description = String(description)
        }
      }

      if (mapping.secondaryKey) {
        const secondary = raw[mapping.secondaryKey]
        if (secondary !== undefined) {
          nextItem.secondary = String(secondary)
        }
      }

      return nextItem
    })
    .filter((item): item is ToolListItem => item !== null)
}

function buildDefaultValues(fields: SettingDefinition[] | undefined): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  if (!fields) return values

  for (const field of fields) {
    if (field.default !== undefined) {
      values[field.id] = field.default
    }
  }

  return values
}

function applyFormValues(
  fields: SettingDefinition[] | undefined,
  data: Record<string, unknown>
): void {
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

  formValues.value = nextValues
}

async function loadViews(): Promise<void> {
  viewsLoading.value = true
  viewsError.value = null

  try {
    const result = await api.tools.getSettingsViews()
    views.value = result
    if (!currentViewKey.value && result.length > 0) {
      const firstView = result[0]
      if (firstView) {
        currentViewKey.value = getViewKey(firstView)
      }
    }
  } catch (error) {
    viewsError.value = error instanceof Error ? error.message : 'Failed to load tools'
  } finally {
    viewsLoading.value = false
  }
}

async function loadList(view: ToolSettingsViewInfo): Promise<void> {
  listLoading.value = true
  listError.value = null

  try {
    const listView = view.view as ToolSettingsListView
    const result = await api.tools.executeTool(
      view.extensionId,
      listView.listToolId,
      getListParams(view)
    )

    if (!result.success) {
      listItems.value = []
      listError.value = result.error ?? 'Failed to load items'
      return
    }

    listItems.value = mapListItems(view, result.data)
  } catch (error) {
    listError.value = error instanceof Error ? error.message : 'Failed to load items'
  } finally {
    listLoading.value = false
  }
}

async function openCreateModal(): Promise<void> {
  if (!currentView.value) return

  modalMode.value = 'create'
  selectedItem.value = null
  formValues.value = buildDefaultValues(currentView.value.fields)
  formError.value = null
  confirmDelete.value = false
  modalOpen.value = true
}

async function openEditModal(item: ToolListItem): Promise<void> {
  if (!currentView.value) return

  modalMode.value = 'edit'
  selectedItem.value = item
  formError.value = null
  confirmDelete.value = false
  formLoading.value = true

  const listView = currentView.value.view as ToolSettingsListView
  const idParam = listView.idParam ?? 'id'

  try {
    if (listView.getToolId) {
      const result = await api.tools.executeTool(
        currentView.value.extensionId,
        listView.getToolId,
        {
          [idParam]: item.id,
        }
      )

      if (!result.success) {
        formError.value = result.error ?? 'Failed to load item'
        applyFormValues(currentView.value.fields, item.raw)
      } else if (result.data && typeof result.data === 'object') {
        applyFormValues(currentView.value.fields, result.data as Record<string, unknown>)
      } else {
        applyFormValues(currentView.value.fields, item.raw)
      }
    } else {
      applyFormValues(currentView.value.fields, item.raw)
    }
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Failed to load item'
    applyFormValues(currentView.value.fields, item.raw)
  } finally {
    formLoading.value = false
    modalOpen.value = true
  }
}

function updateFormValue(key: string, value: unknown): void {
  formValues.value = { ...formValues.value, [key]: value }
}

async function saveItem(): Promise<void> {
  if (!currentView.value || !currentListView.value?.upsertToolId) return

  formSaving.value = true
  formError.value = null

  const params: Record<string, unknown> = { ...formValues.value }
  const idParam = currentListView.value.idParam ?? 'id'

  if (modalMode.value === 'edit' && selectedItem.value && !(idParam in params)) {
    params[idParam] = selectedItem.value.id
  }

  try {
    const result = await api.tools.executeTool(
      currentView.value.extensionId,
      currentListView.value.upsertToolId,
      params
    )

    if (!result.success) {
      formError.value = result.error ?? 'Failed to save item'
      return
    }

    modalOpen.value = false
    await loadList(currentView.value)
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Failed to save item'
  } finally {
    formSaving.value = false
  }
}

async function deleteItem(): Promise<void> {
  if (!currentView.value || !currentListView.value?.deleteToolId || !selectedItem.value) return

  formSaving.value = true
  formError.value = null

  const idParam = currentListView.value.idParam ?? 'id'

  try {
    const result = await api.tools.executeTool(
      currentView.value.extensionId,
      currentListView.value.deleteToolId,
      { [idParam]: selectedItem.value.id }
    )

    if (!result.success) {
      formError.value = result.error ?? 'Failed to delete item'
      return
    }

    modalOpen.value = false
    await loadList(currentView.value)
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Failed to delete item'
  } finally {
    formSaving.value = false
    confirmDelete.value = false
  }
}

watch(
  () => [currentViewKey.value, searchQuery.value],
  () => {
    if (currentView.value) {
      void loadList(currentView.value)
    }
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

onMounted(() => {
  void loadViews()
})
</script>

<template>
  <div class="tools-view">
    <ToolsViewMenu v-model="currentViewKey" :items="menuItems" />

    <div class="content">
      <div class="extension-name">
        <Icon name="puzzle" />
        {{ t('tools.from_extension', { name: currentView?.extensionName ?? '-' }) }}
      </div>
      <div v-if="viewsLoading" class="status loading">
        <Icon name="loading-03" class="spin" />
        {{ $t('common.loading') }}
      </div>
      <div v-else-if="viewsError" class="status error">
        {{ viewsError }}
      </div>
      <div v-else-if="!currentView" class="status muted">
        {{ $t('tools.no_tools') }}
      </div>
      <EntityList
        v-else
        :title="currentView.title"
        :description="currentDescription"
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
        <ExtensionSettingsForm
          v-else
          :definitions="currentView?.fields ?? []"
          :values="formValues"
          :loading="formSaving"
          :extension-id="currentView?.extensionId"
          @update="updateFormValue"
        />

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
.tools-view {
  display: grid;
  grid-template-columns: auto 1fr;
  width: 100%;
  height: 100%;
  max-height: 100%;
  overflow-y: hidden;

  > .content {
    padding: var(--spacing-large);
    height: 100%;
    max-height: 100%;
    overflow-y: auto;

    > .extension-name {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
      font-size: 1rem;
      color: var(--theme-general-color-muted);
    }

    > .status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--theme-general-color-muted);

      &.error {
        color: var(--theme-general-color-danger, #dc2626);
      }

      &.loading {
        color: var(--theme-general-color-muted);
      }
    }

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
