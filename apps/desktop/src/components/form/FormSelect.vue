<script setup lang="ts">
  import { computed } from 'vue';

  export type SelectValue = string | number | null;
  export type SelectOption = { value: SelectValue; label: string; disabled?: boolean };

  /**
   * Standard select control with shared label/hint/error styling.
   */
  const props = withDefaults(
    defineProps<{
      label?: string;
      hint?: string;
      error?: string;
      placeholder?: string;
      options: SelectOption[];
      disabled?: boolean;
      required?: boolean;
      id?: string;
    }>(),
    {
      options: () => [],
      disabled: false,
      required: false,
    },
  );

  const model = defineModel<SelectValue>({ default: '' });
  const inputId = computed(
    () => props.id ?? `select-${Math.random().toString(36).slice(2, 8)}`,
  );
</script>

<template>
  <label class="field" :for="inputId">
    <span v-if="label" class="label">
      {{ label }}
      <span v-if="required" class="required" aria-hidden="true">*</span>
    </span>
    <select
      :id="inputId"
      :value="model ?? ''"
      :disabled="disabled"
      :required="required"
      @change="model = ($event.target as HTMLSelectElement).value"
    >
      <option v-if="placeholder" disabled value="">{{ placeholder }}</option>
      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        :disabled="option.disabled"
      >
        {{ option.label }}
      </option>
    </select>
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

    > .label {
      font-weight: var(--font-weight-medium);
    }

    > .required {
      color: var(--error);
      margin-left: 0.2rem;
    }

    > select {
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
