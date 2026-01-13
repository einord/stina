<script setup lang="ts">
/**
 * Dynamic form generator for extension settings.
 * Renders form fields based on SettingDefinition[] from extension manifest.
 */
import { computed, ref, watch } from 'vue'
import type { SettingCreateMapping, SettingDefinition, SettingOptionsMapping } from '@stina/extension-api'
import { useApi } from '../../composables/useApi.js'
import Modal from './Modal.vue'
import SimpleButton from '../buttons/SimpleButton.vue'

const props = defineProps<{
  /**
   * Setting definitions from extension manifest
   */
  definitions: SettingDefinition[]
  /**
   * Extension ID (needed for tool-backed select options)
   */
  extensionId?: string
  /**
   * Current setting values
   */
  values: Record<string, unknown>
  /**
   * Whether the form is in a loading state
   */
  loading?: boolean
}>()

const emit = defineEmits<{
  /**
   * Emitted when a setting value changes
   */
  update: [key: string, value: unknown]
}>()

type SelectOption = { value: string; label: string }

const api = useApi()
const dynamicOptions = ref<Record<string, SelectOption[]>>({})
const dynamicOptionsLoading = ref<Record<string, boolean>>({})
const createModalOpen = ref(false)
const createModalSetting = ref<SettingDefinition | null>(null)
const createValues = ref<Record<string, unknown>>({})
const createSaving = ref(false)
const createError = ref<string | null>(null)

const getMapping = (setting: SettingDefinition): SettingOptionsMapping => {
  return (
    setting.optionsMapping ?? {
      itemsKey: 'items',
      valueKey: 'value',
      labelKey: 'label',
    }
  )
}

const buildOptions = (setting: SettingDefinition): SelectOption[] => {
  const staticOptions = setting.options ?? []
  const fetchedOptions = dynamicOptions.value[setting.id] ?? []
  return [...staticOptions, ...fetchedOptions]
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

const getCreateMapping = (setting: SettingDefinition): SettingCreateMapping => {
  return setting.createMapping ?? { valueKey: 'id' }
}

const getCreateValue = (setting: SettingDefinition): unknown => {
  if (createValues.value[setting.id] !== undefined) {
    return createValues.value[setting.id]
  }
  return setting.default
}

const handleCreateChange = (setting: SettingDefinition, event: Event) => {
  const target = event.target as HTMLInputElement | HTMLSelectElement

  let value: unknown
  switch (setting.type) {
    case 'boolean':
      value = (target as HTMLInputElement).checked
      break
    case 'number':
      value = parseFloat(target.value) || 0
      break
    default:
      value = target.value
  }

  createValues.value = { ...createValues.value, [setting.id]: value }
}

const loadOptions = async (setting: SettingDefinition): Promise<void> => {
  if (!setting.optionsToolId || setting.type !== 'select') return
  if (!props.extensionId) return

  dynamicOptionsLoading.value = { ...dynamicOptionsLoading.value, [setting.id]: true }

  try {
    const result = await api.tools.executeTool(
      props.extensionId,
      setting.optionsToolId,
      setting.optionsParams ?? {}
    )

    if (!result.success) {
      dynamicOptions.value = { ...dynamicOptions.value, [setting.id]: [] }
      return
    }

    const mapping = getMapping(setting)
    const data = result.data
    if (!data || typeof data !== 'object') {
      dynamicOptions.value = { ...dynamicOptions.value, [setting.id]: [] }
      return
    }

    const items = (data as Record<string, unknown>)[mapping.itemsKey]
    if (!Array.isArray(items)) {
      dynamicOptions.value = { ...dynamicOptions.value, [setting.id]: [] }
      return
    }

    const options = items
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const record = item as Record<string, unknown>
        const value = record[mapping.valueKey]
        const label = record[mapping.labelKey]
        if (value === undefined || label === undefined) return null
        return { value: String(value), label: String(label) }
      })
      .filter((option): option is SelectOption => option !== null)

    dynamicOptions.value = { ...dynamicOptions.value, [setting.id]: options }
  } finally {
    dynamicOptionsLoading.value = { ...dynamicOptionsLoading.value, [setting.id]: false }
  }
}

const openCreateModal = async (setting: SettingDefinition): Promise<void> => {
  if (!setting.createToolId || !setting.createFields) return
  createModalSetting.value = setting
  createValues.value = buildDefaultValues(setting.createFields)
  createError.value = null
  createModalOpen.value = true

  for (const field of setting.createFields) {
    if (field.optionsToolId && field.type === 'select') {
      await loadOptions(field)
    }
  }
}

const saveCreate = async (): Promise<void> => {
  const setting = createModalSetting.value
  if (!setting?.createToolId || !props.extensionId) return

  createSaving.value = true
  createError.value = null

  try {
    const params = { ...(setting.createParams ?? {}), ...createValues.value }
    const result = await api.tools.executeTool(props.extensionId, setting.createToolId, params)

    if (!result.success) {
      createError.value = result.error ?? 'Failed to create item'
      return
    }

    await loadOptions(setting)

    const mapping = getCreateMapping(setting)
    let data = result.data as Record<string, unknown> | undefined
    if (mapping.resultKey && data && typeof data === 'object') {
      const next = data[mapping.resultKey]
      data = next && typeof next === 'object' ? (next as Record<string, unknown>) : undefined
    }

    const value = data?.[mapping.valueKey]
    if (value !== undefined) {
      emit('update', setting.id, String(value))
    }

    createModalOpen.value = false
  } catch (error) {
    createError.value = error instanceof Error ? error.message : 'Failed to create item'
  } finally {
    createSaving.value = false
  }
}

watch(
  () => [props.extensionId, props.definitions],
  () => {
    for (const setting of props.definitions) {
      if (setting.optionsToolId && setting.type === 'select') {
        void loadOptions(setting)
      }
    }
  },
  { immediate: true, deep: true }
)

/**
 * Get the current value for a setting, falling back to default
 */
function getValue(setting: SettingDefinition): unknown {
  if (props.values[setting.id] !== undefined) {
    return props.values[setting.id]
  }
  return setting.default
}

/**
 * Handle input changes and emit update event
 */
function handleChange(setting: SettingDefinition, event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement

  let value: unknown
  switch (setting.type) {
    case 'boolean':
      value = (target as HTMLInputElement).checked
      break
    case 'number':
      value = parseFloat(target.value) || 0
      break
    default:
      value = target.value
  }

  emit('update', setting.id, value)
}

/**
 * Check if a setting has a validation error
 */
function hasError(setting: SettingDefinition): boolean {
  if (!setting.validation?.required) return false
  const value = getValue(setting)
  return value === undefined || value === null || value === ''
}

const hasSettings = computed(() => props.definitions.length > 0)
</script>

<template>
  <div class="extension-settings-form">
    <div v-if="!hasSettings" class="no-settings">
      {{ $t('extensions.no_settings') }}
    </div>

    <div v-else class="settings-list">
      <div
        v-for="setting in definitions"
        :key="setting.id"
        class="setting-field"
        :class="{ error: hasError(setting) }"
      >
        <label :for="`setting-${setting.id}`" class="field-label">
          {{ setting.title }}
          <span v-if="setting.validation?.required" class="required">*</span>
        </label>

        <p v-if="setting.description" class="field-description">
          {{ setting.description }}
        </p>

        <!-- String input -->
        <input
          v-if="setting.type === 'string'"
          :id="`setting-${setting.id}`"
          type="text"
          class="field-input"
          :value="getValue(setting)"
          :disabled="loading"
          :placeholder="String(setting.default ?? '')"
          @change="handleChange(setting, $event)"
        />

        <!-- Number input -->
        <input
          v-else-if="setting.type === 'number'"
          :id="`setting-${setting.id}`"
          type="number"
          class="field-input"
          :value="getValue(setting)"
          :disabled="loading"
          :min="setting.validation?.min"
          :max="setting.validation?.max"
          @change="handleChange(setting, $event)"
        />

        <!-- Boolean toggle -->
        <label v-else-if="setting.type === 'boolean'" class="toggle-wrapper">
          <input
            :id="`setting-${setting.id}`"
            type="checkbox"
            class="toggle-input"
            :checked="Boolean(getValue(setting))"
            :disabled="loading"
            @change="handleChange(setting, $event)"
          />
          <span class="toggle-slider" />
        </label>

        <!-- Select dropdown -->
        <div v-else-if="setting.type === 'select'" class="select-row">
          <select
            :id="`setting-${setting.id}`"
            class="field-select"
            :value="getValue(setting)"
            :disabled="loading"
            @change="handleChange(setting, $event)"
          >
            <option
              v-if="dynamicOptionsLoading[setting.id] && buildOptions(setting).length === 0"
              value=""
              disabled
            >
              Loading...
            </option>
            <option
              v-for="option in buildOptions(setting)"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
          <button
            v-if="setting.createToolId"
            class="field-action"
            type="button"
            :disabled="loading"
            @click="openCreateModal(setting)"
          >
            {{ setting.createLabel ?? 'Create' }}
          </button>
        </div>
      </div>
    </div>
    <Modal
      v-model="createModalOpen"
      :title="createModalSetting?.createLabel ?? 'Create'"
      close-label="Close"
    >
      <div v-if="createError" class="modal-error">{{ createError }}</div>
      <div v-if="createModalSetting?.createFields" class="modal-form">
        <div
          v-for="field in createModalSetting.createFields"
          :key="field.id"
          class="setting-field"
          :class="{ error: field.validation?.required && !getCreateValue(field) }"
        >
          <label :for="`create-${field.id}`" class="field-label">
            {{ field.title }}
            <span v-if="field.validation?.required" class="required">*</span>
          </label>

          <p v-if="field.description" class="field-description">
            {{ field.description }}
          </p>

          <input
            v-if="field.type === 'string'"
            :id="`create-${field.id}`"
            type="text"
            class="field-input"
            :value="getCreateValue(field)"
            :disabled="createSaving"
            :placeholder="String(field.default ?? '')"
            @change="handleCreateChange(field, $event)"
          />

          <input
            v-else-if="field.type === 'number'"
            :id="`create-${field.id}`"
            type="number"
            class="field-input"
            :value="getCreateValue(field)"
            :disabled="createSaving"
            :min="field.validation?.min"
            :max="field.validation?.max"
            @change="handleCreateChange(field, $event)"
          />

          <label v-else-if="field.type === 'boolean'" class="toggle-wrapper">
            <input
              :id="`create-${field.id}`"
              type="checkbox"
              class="toggle-input"
              :checked="Boolean(getCreateValue(field))"
              :disabled="createSaving"
              @change="handleCreateChange(field, $event)"
            />
            <span class="toggle-slider" />
          </label>

          <select
            v-else-if="field.type === 'select'"
            :id="`create-${field.id}`"
            class="field-select"
            :value="getCreateValue(field)"
            :disabled="createSaving"
            @change="handleCreateChange(field, $event)"
          >
            <option
              v-if="dynamicOptionsLoading[field.id] && buildOptions(field).length === 0"
              value=""
              disabled
            >
              Loading...
            </option>
            <option
              v-for="option in buildOptions(field)"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>
      </div>
      <template #footer>
        <SimpleButton type="normal" :disabled="createSaving" @click="createModalOpen = false">
          Cancel
        </SimpleButton>
        <SimpleButton type="primary" :disabled="createSaving" @click="saveCreate">
          Save
        </SimpleButton>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.extension-settings-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;

  > .no-settings {
    color: var(--theme-general-color-muted);
    font-size: 0.875rem;
    text-align: center;
    padding: 1rem;
  }

  > .settings-list {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;

    > .setting-field {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;

      &.error {
        > .field-label {
          color: var(--theme-general-color-danger);
        }

        > .field-input,
        > .field-select {
          border-color: var(--theme-general-color-danger);
        }
      }

      > .field-label {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--theme-general-color);

        > .required {
          color: var(--theme-general-color-danger);
          margin-left: 0.125rem;
        }
      }

      > .field-description {
        font-size: 0.75rem;
        color: var(--theme-general-color-muted);
        margin: 0;
        line-height: 1.4;
      }

      > .select-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;

        > .field-select {
          flex: 1;
        }

        > .field-action {
          border: 1px solid var(--theme-general-border-color);
          background: transparent;
          color: var(--theme-general-color);
          font-size: 0.75rem;
          padding: 0.35rem 0.6rem;
          border-radius: var(--border-radius-small, 0.375rem);
          cursor: pointer;

          &:hover {
            background: var(--theme-general-background-hover);
          }

          &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
        }
      }

      > .field-input,
      > .field-select {
        padding: 0.625rem 0.75rem;
        font-size: 0.875rem;
        border: 1px solid var(--theme-general-border-color);
        border-radius: var(--border-radius-small, 0.375rem);
        background: var(--theme-components-input-background, transparent);
        color: var(--theme-general-color);
        transition: border-color 0.2s;

        &:focus {
          outline: none;
          border-color: var(--theme-general-color-primary);
        }

        &:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        &::placeholder {
          color: var(--theme-general-color-muted);
        }
      }

      > .toggle-wrapper {
        display: flex;
        align-items: center;
        cursor: pointer;
        width: fit-content;

        > .toggle-input {
          display: none;

          &:checked + .toggle-slider {
            background: var(--theme-general-color-primary);

            &::before {
              transform: translateX(1.25rem);
            }
          }

          &:disabled + .toggle-slider {
            opacity: 0.6;
            cursor: not-allowed;
          }
        }

        > .toggle-slider {
          position: relative;
          width: 2.75rem;
          height: 1.5rem;
          background: var(--theme-general-border-color);
          border-radius: 999px;
          transition: background 0.2s;

          &::before {
            content: '';
            position: absolute;
            top: 0.125rem;
            left: 0.125rem;
            width: 1.25rem;
            height: 1.25rem;
            background: white;
            border-radius: 50%;
            transition: transform 0.2s;
          }
        }
      }
    }
  }
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.modal-error {
  color: var(--theme-general-color-danger);
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
}
</style>
