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
  const inputId = computed(() => props.id ?? `checkbox-${Math.random().toString(36).slice(2, 8)}`);
</script>

<template>
  <label class="checkbox" :class="{ disabled }" :for="inputId">
    <div class="control">
      <input
        :id="inputId"
        class="native"
        type="checkbox"
        :checked="model"
        :disabled="disabled"
        :required="required"
        @change="model = ($event.target as HTMLInputElement).checked"
      />
      <span class="switch" aria-hidden="true">
        <span class="thumb" />
      </span>
      <span class="label">
        {{ label }}
        <span v-if="required" class="required" aria-hidden="true">*</span>
      </span>
    </div>
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

    &.disabled {
      cursor: not-allowed;
      opacity: 0.7;
    }

    > .control {
      display: inline-flex;
      align-items: center;
      gap: 0.65rem;
      cursor: pointer;
      user-select: none;

      > .switch {
        position: relative;
        width: 2.6rem;
        height: 1.45rem;
        border-radius: 999px;
        background: var(--border);
        border: 1px solid var(--border);
        display: inline-block;
        transition:
          background-color 0.2s ease,
          border-color 0.2s ease,
          box-shadow 0.2s ease;

        > .thumb {
          position: absolute;
          top: 50%;
          left: 0.15rem;
          width: 1.1rem;
          height: 1.1rem;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid var(--interactive-bg);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
          transform: translate(0, -50%);
          transition:
            transform 0.18s ease,
            background-color 0.2s ease;
        }
      }

      > .label {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;

        > .required {
          color: var(--error);
        }
      }

      > .native {
        position: absolute;
        opacity: 0;
        pointer-events: none;

        &:checked + .switch {
          background: var(--primary);
          border-color: var(--primary);

          > .thumb {
            transform: translate(1.1rem, -50%);
            background: var(--text);
          }
        }

        &:focus-visible + .switch {
          box-shadow:
            0 0 0 3px rgba(0, 0, 0, 0.08),
            0 0 0 2px var(--primary);
        }

        &:disabled + .switch {
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

    &.disabled > .control {
      cursor: not-allowed;
    }
  }
</style>
