<script setup lang="ts">
  import { computed } from 'vue';

  /**
   * Checkbox with shared label/hint/error styling.
   */
  const props = withDefaults(
    defineProps<{
      label?: string;
      hint?: string;
      error?: string;
      disabled?: boolean;
      required?: boolean;
      id?: string;
    }>(),
    {
      disabled: false,
      required: false,
    },
  );

  const model = defineModel<boolean>({ default: false });
  const inputId = computed(
    () => props.id ?? `checkbox-${Math.random().toString(36).slice(2, 8)}`,
  );
</script>

<template>
  <label class="checkbox" :for="inputId">
    <input
      :id="inputId"
      type="checkbox"
      :checked="model"
      :disabled="disabled"
      :required="required"
      @change="model = ($event.target as HTMLInputElement).checked"
    />
    <span class="label">
      {{ label }}
      <span v-if="required" class="required" aria-hidden="true">*</span>
    </span>
    <small v-if="hint" class="hint">{{ hint }}</small>
    <small v-if="error" class="error">{{ error }}</small>
  </label>
</template>

<style scoped>
  .checkbox {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.95rem;
    color: var(--text);

    > .label {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
    }

    > .required {
      color: var(--error);
    }

    > input[type='checkbox'] {
      accent-color: var(--primary);
      width: 1rem;
      height: 1rem;

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
