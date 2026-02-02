<script setup lang="ts">
/**
 * Text input component with optional label, hint, and error display.
 */
withDefaults(
  defineProps<{
    /** Label displayed above the input */
    label?: string
    /** Placeholder text */
    placeholder?: string
    /** Hint text displayed below the input */
    hint?: string
    /** Error message displayed below the input */
    error?: string
    /** Whether the input is disabled */
    disabled?: boolean
    /** Input type (text, email, password, url) */
    type?: 'text' | 'email' | 'password' | 'url'
  }>(),
  {
    label: undefined,
    placeholder: '',
    hint: undefined,
    error: undefined,
    disabled: false,
    type: 'text',
  }
)

const model = defineModel<string>({ default: '' })
</script>

<template>
  <div class="text-input" :class="{ disabled, 'has-error': error }">
    <label v-if="label" class="label">{{ label }}</label>
    <input
      v-model="model"
      :type="type"
      :placeholder="placeholder"
      :disabled="disabled"
      class="input"
    />
    <span v-if="error" class="error">{{ error }}</span>
    <span v-else-if="hint" class="hint">{{ hint }}</span>
  </div>
</template>

<style scoped>
.text-input {
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

  > .input {
    width: 100%;
    padding: 0.625rem 0.75rem;
    font-size: 0.85rem;
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
  }

  &.has-error > .input {
    border-color: var(--theme-general-color-danger, #dc2626);
  }

  > .hint {
    font-size: 0.75rem;
    color: var(--theme-general-color-muted);
  }

  > .error {
    font-size: 0.75rem;
    color: var(--theme-general-color-danger, #dc2626);
  }
}
</style>
