<script setup lang="ts">
/**
 * Select dropdown component with optional label and error display.
 */
export interface SelectOption {
  value: string
  label: string
}

const props = withDefaults(
  defineProps<{
    /** Available options */
    options: SelectOption[]
    /** Label displayed above the select */
    label?: string
    /** Placeholder text for empty state */
    placeholder?: string
    /** Error message displayed below the select */
    error?: string
    /** Whether the select is disabled */
    disabled?: boolean
  }>(),
  {
    label: undefined,
    placeholder: undefined,
    error: undefined,
    disabled: false,
  }
)

const model = defineModel<string>({ default: '' })
</script>

<template>
  <div class="select-input" :class="{ disabled, 'has-error': error }">
    <label v-if="label" class="label">{{ label }}</label>
    <select v-model="model" :disabled="disabled" class="select">
      <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
      <option v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
    <span v-if="error" class="error">{{ error }}</span>
  </div>
</template>

<style scoped>
.select-input {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  width: 100%;

  &.disabled {
    opacity: 0.6;
    pointer-events: none;
  }

  > .label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--theme-general-color);
  }

  > .select {
    width: 100%;
    padding: 0.625rem 0.75rem;
    font-size: 0.875rem;
    border: 1px solid var(--theme-general-border-color);
    border-radius: var(--border-radius-small, 0.375rem);
    background: var(--theme-components-input-background, transparent);
    color: var(--theme-general-color);
    cursor: pointer;
    transition: border-color 0.2s;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.75rem center;
    padding-right: 2.5rem;

    &:focus {
      outline: none;
      border-color: var(--theme-general-color-primary);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  &.has-error > .select {
    border-color: var(--theme-general-color-danger, #dc2626);
  }

  > .error {
    font-size: 0.75rem;
    color: var(--theme-general-color-danger, #dc2626);
  }
}
</style>
