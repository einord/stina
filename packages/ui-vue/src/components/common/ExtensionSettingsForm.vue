<script setup lang="ts">
/**
 * Dynamic form generator for extension settings.
 * Renders form fields based on SettingDefinition[] from extension manifest.
 */
import { computed } from 'vue'
import type { SettingDefinition } from '@stina/extension-api'

const props = defineProps<{
  /**
   * Setting definitions from extension manifest
   */
  definitions: SettingDefinition[]
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
        <select
          v-else-if="setting.type === 'select'"
          :id="`setting-${setting.id}`"
          class="field-select"
          :value="getValue(setting)"
          :disabled="loading"
          @change="handleChange(setting, $event)"
        >
          <option
            v-for="option in setting.options"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </div>
    </div>
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
</style>
