<script setup lang="ts">
/**
 * Dynamic form component that renders provider configuration fields
 * based on a schema definition from the extension manifest.
 *
 * This component enables extensions to define their settings declaratively
 * without requiring custom Vue components or extension-specific code in the app.
 */
import { computed, watch } from 'vue'
import type { ProviderConfigSchema, ProviderConfigProperty } from '@stina/extension-api'
import TextInput from '../inputs/TextInput.vue'
import Toggle from '../inputs/Toggle.vue'
import Select from '../inputs/Select.vue'

const props = defineProps<{
  /** Configuration schema from the provider definition */
  schema: ProviderConfigSchema
  /** Current values for each property */
  modelValue: Record<string, unknown>
  /** Whether all form fields should be disabled */
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>]
}>()

/**
 * Ordered property entry with key and property definition.
 */
interface OrderedPropertyEntry {
  key: string
  property: ProviderConfigProperty
}

/**
 * Get properties in the correct order.
 * Uses schema.order if defined, otherwise object key order.
 */
const orderedProperties = computed((): OrderedPropertyEntry[] => {
  const properties = props.schema.properties
  const keys = props.schema.order ?? Object.keys(properties)

  return keys
    .filter((key) => key in properties)
    .map((key) => ({
      key,
      // Property is guaranteed to exist after the filter
      property: properties[key]!,
    }))
})

/**
 * Get the current value for a property, falling back to default
 */
function getValue(key: string, property: ProviderConfigProperty): unknown {
  if (key in props.modelValue) {
    return props.modelValue[key]
  }
  return property.default
}

/**
 * Update a single property value
 */
function updateValue(key: string, value: unknown): void {
  emit('update:modelValue', {
    ...props.modelValue,
    [key]: value,
  })
}

/**
 * Get validation error for a property
 */
function getValidationError(key: string, property: ProviderConfigProperty): string | undefined {
  const value = getValue(key, property)

  // Check required
  if (property.required) {
    if (value === undefined || value === null || value === '') {
      return 'This field is required'
    }
  }

  // Skip further validation if empty and not required
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  const validation = property.validation
  if (!validation) return undefined

  // String validations
  if (typeof value === 'string') {
    if (validation.minLength !== undefined && value.length < validation.minLength) {
      return `Minimum length is ${validation.minLength} characters`
    }
    if (validation.maxLength !== undefined && value.length > validation.maxLength) {
      return `Maximum length is ${validation.maxLength} characters`
    }
    if (validation.pattern) {
      const regex = new RegExp(validation.pattern)
      if (!regex.test(value)) {
        return 'Invalid format'
      }
    }
  }

  // Number validations
  if (typeof value === 'number') {
    if (validation.min !== undefined && value < validation.min) {
      return `Minimum value is ${validation.min}`
    }
    if (validation.max !== undefined && value > validation.max) {
      return `Maximum value is ${validation.max}`
    }
  }

  // URL validation for url type
  if (property.type === 'url' && typeof value === 'string') {
    try {
      new URL(value)
    } catch {
      return 'Invalid URL'
    }
  }

  return undefined
}

/**
 * Convert select options to the format expected by Select component
 */
function getSelectOptions(property: ProviderConfigProperty) {
  return (property.options ?? []).map((opt) => ({
    value: opt.value,
    label: opt.label,
  }))
}

/**
 * Get input type for TextInput based on property type
 */
function getInputType(propertyType: string): 'text' | 'password' | 'url' {
  switch (propertyType) {
    case 'password':
      return 'password'
    case 'url':
      return 'url'
    default:
      return 'text'
  }
}

// Initialize default values on mount
watch(
  () => props.schema,
  (schema) => {
    if (!schema) return

    const defaults: Record<string, unknown> = {}
    let hasDefaults = false

    for (const [key, property] of Object.entries(schema.properties)) {
      if (property.default !== undefined && !(key in props.modelValue)) {
        defaults[key] = property.default
        hasDefaults = true
      }
    }

    if (hasDefaults) {
      emit('update:modelValue', { ...defaults, ...props.modelValue })
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="provider-config-form">
    <div
      v-for="{ key, property } in orderedProperties"
      :key="key"
      class="form-field"
    >
      <!-- String, URL, Password -->
      <TextInput
        v-if="property.type === 'string' || property.type === 'url' || property.type === 'password'"
        :model-value="(getValue(key, property) as string) ?? ''"
        :label="property.title"
        :placeholder="property.placeholder"
        :hint="property.description"
        :error="getValidationError(key, property)"
        :disabled="disabled"
        :type="getInputType(property.type)"
        @update:model-value="updateValue(key, $event)"
      />

      <!-- Number -->
      <TextInput
        v-else-if="property.type === 'number'"
        :model-value="String(getValue(key, property) ?? '')"
        :label="property.title"
        :placeholder="property.placeholder"
        :hint="property.description"
        :error="getValidationError(key, property)"
        :disabled="disabled"
        type="text"
        @update:model-value="updateValue(key, $event === '' ? undefined : Number($event))"
      />

      <!-- Boolean -->
      <Toggle
        v-else-if="property.type === 'boolean'"
        :model-value="(getValue(key, property) as boolean) ?? false"
        :label="property.title"
        :disabled="disabled"
        @update:model-value="updateValue(key, $event)"
      />

      <!-- Select -->
      <Select
        v-else-if="property.type === 'select'"
        :model-value="(getValue(key, property) as string) ?? ''"
        :label="property.title"
        :options="getSelectOptions(property)"
        :placeholder="property.placeholder"
        :error="getValidationError(key, property)"
        :disabled="disabled"
        @update:model-value="updateValue(key, $event)"
      />

      <!-- Description for Toggle (since Toggle doesn't have hint) -->
      <span
        v-if="property.type === 'boolean' && property.description"
        class="toggle-description"
      >
        {{ property.description }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.provider-config-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;

  > .form-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;

    > .toggle-description {
      font-size: 0.75rem;
      color: var(--theme-general-color-muted);
      margin-top: -0.25rem;
    }
  }
}
</style>
