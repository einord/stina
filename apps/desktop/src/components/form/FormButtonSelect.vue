<script setup lang="ts">
  export type ButtonSelectOption = { value: string | number; label: string; disabled?: boolean };

  /**
   * Renders a small group of toggle buttons for short option lists.
   */
  defineProps<{
    label?: string;
    hint?: string;
    error?: string;
    options: ButtonSelectOption[];
    required?: boolean;
  }>();

  const model = defineModel<string | number | null>({ default: '' });
</script>

<template>
  <div class="field">
    <span v-if="label" class="label">
      {{ label }}
      <span v-if="required" class="required" aria-hidden="true">*</span>
    </span>
    <div class="button-group">
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        :class="['option', { active: option.value === model }]"
        :disabled="option.disabled"
        @click="model = option.value"
      >
        {{ option.label }}
      </button>
    </div>
    <small v-if="hint" class="hint">{{ hint }}</small>
    <small v-if="error" class="error">{{ error }}</small>
  </div>
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

    > .button-group {
      display: inline-flex;
      gap: 0.35rem;
      flex-wrap: wrap;

      > .option {
        border: 1px solid var(--border);
        border-radius: var(--border-radius-normal);
        background: var(--window-bg-lower);
        color: var(--text);
        padding: 0.5rem 0.75rem;
        cursor: pointer;
        transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;

        &:hover {
          border-color: var(--primary);
        }

        &.active {
          border-color: var(--primary);
          background: color-mix(in srgb, var(--primary) 15%, var(--window-bg-lower));
          color: var(--text);
        }

        &:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }
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
