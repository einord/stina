<script setup lang="ts">
/**
 * TextArea component for multi-line text input.
 */
const props = withDefaults(
  defineProps<{
    /** Label displayed above the textarea */
    label?: string
    /** Placeholder text */
    placeholder?: string
    /** Number of visible text rows */
    rows?: number
    /** Error message displayed below the textarea */
    error?: string
    /** Whether the textarea is disabled */
    disabled?: boolean
  }>(),
  {
    label: undefined,
    placeholder: '',
    rows: 4,
    error: undefined,
    disabled: false,
  }
)

const model = defineModel<string>({ default: '' })
</script>

<template>
  <div class="textarea-input" :class="{ disabled, 'has-error': error }">
    <label v-if="label" class="label">{{ label }}</label>
    <textarea
      v-model="model"
      :placeholder="placeholder"
      :rows="rows"
      :disabled="disabled"
      class="textarea"
    />
    <span v-if="error" class="error">{{ error }}</span>
  </div>
</template>

<style scoped>
.textarea-input {
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

  > .textarea {
    width: 100%;
    padding: 0.625rem 0.75rem;
    font-size: 0.875rem;
    font-family: inherit;
    line-height: 1.5;
    border: 1px solid var(--theme-general-border-color);
    border-radius: var(--border-radius-small, 0.375rem);
    background: var(--theme-components-input-background, transparent);
    color: var(--theme-general-color);
    resize: vertical;
    transition: border-color 0.2s;

    &:focus {
      outline: none;
      border-color: var(--theme-general-color-primary);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      resize: none;
    }
  }

  &.has-error > .textarea {
    border-color: var(--theme-general-color-danger, #dc2626);
  }

  > .error {
    font-size: 0.75rem;
    color: var(--theme-general-color-danger, #dc2626);
  }
}
</style>
