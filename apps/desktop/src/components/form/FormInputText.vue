<script setup lang="ts">
  import { computed } from 'vue';
import FormLabel from '../ui/FormLabel.vue';

  /**
   * Single-line text input with shared styling and optional label/hint/error.
   */
  const props = withDefaults(
    defineProps<{
      label?: string;
      hint?: string;
      error?: string;
      placeholder?: string;
      type?: 'text' | 'email' | 'number' | 'password' | 'search' | 'url';
      disabled?: boolean;
      required?: boolean;
      id?: string;
      min?: string | number;
      max?: string | number;
      step?: string | number;
      selected?: boolean;
    }>(),
    {
      type: 'text',
      disabled: false,
      required: false,
    },
  );

  const model = defineModel<string | null>({ default: '' });
  const inputId = computed(
    () => props.id ?? `input-${Math.random().toString(36).slice(2, 8)}`,
  );
</script>

<template>
  <label class="field" :for="inputId">
    <FormLabel v-if="label" :required="required">{{ label }}</FormLabel>
    <input
      :id="inputId"
      :value="model ?? ''"
      :type="props.type"
      :placeholder="placeholder"
      :disabled="disabled"
      :required="required"
      :min="min"
      :max="max"
      :step="step"
      :selected="selected"
      @input="model = ($event.target as HTMLInputElement).value"
    />
    <small v-if="hint" class="hint">{{ hint }}</small>
    <small v-if="error" class="error">{{ error }}</small>
  </label>
</template>

<style scoped>
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.95rem;
    color: var(--text);

    > .required {
      color: var(--error);
      margin-left: 0.2rem;
    }

    > input {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: var(--border-radius-normal);
      padding: 0.65rem 0.75rem;
      background: var(--window-bg-lower);
      color: var(--text);
      transition: border-color 0.15s ease, box-shadow 0.15s ease;

      &:focus {
        outline: none;
        border-color: var(--primary);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 15%, transparent);
      }

      &:disabled {
        opacity: 0.65;
        cursor: not-allowed;
      }
    }

    > .hint {
      color: var(--muted);
      font-size: 0.85rem;
    }

    > .error {
      color: var(--error);
      font-size: 0.85rem;
    }
  }
</style>
