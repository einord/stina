<script setup lang="ts">
/**
 * Toggle switch component for boolean values.
 */
const props = withDefaults(
  defineProps<{
    /** Label displayed next to the toggle */
    label?: string
    /** Description displayed below the label */
    description?: string
    /** Whether the toggle is disabled */
    disabled?: boolean
  }>(),
  {
    label: undefined,
    description: undefined,
    disabled: false,
  }
)

const model = defineModel<boolean>({ default: false })

function toggle() {
  if (!props.disabled) {
    model.value = !model.value
  }
}
</script>

<template>
  <div class="toggle-input" :class="{ disabled }" @click="toggle">
    <div class="toggle-wrapper">
      <button
        type="button"
        role="switch"
        :aria-checked="model"
        :disabled="disabled"
        class="toggle"
        :class="{ active: model }"
      >
        <span class="thumb" />
      </button>
      <div v-if="label || description" class="content">
        <span v-if="label" class="label">{{ label }}</span>
        <span v-if="description" class="description">{{ description }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toggle-input {
  cursor: pointer;

  &.disabled {
    opacity: 0.6;
    pointer-events: none;
    cursor: not-allowed;
  }

  > .toggle-wrapper {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;

    > .toggle {
      position: relative;
      flex-shrink: 0;
      width: 2.75rem;
      height: 1.5rem;
      padding: 0;
      border: none;
      border-radius: 9999px;
      background: var(--theme-general-border-color);
      cursor: pointer;
      transition: background-color 0.2s;

      &.active {
        background: var(--theme-general-color-primary);
      }

      > .thumb {
        position: absolute;
        top: 0.125rem;
        left: 0.125rem;
        width: 1.25rem;
        height: 1.25rem;
        border-radius: 9999px;
        background: white;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
        transition: transform 0.2s;
      }

      &.active > .thumb {
        transform: translateX(1.25rem);
      }

      &:focus-visible {
        outline: 2px solid var(--theme-general-color-primary);
        outline-offset: 2px;
      }
    }

    > .content {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;

      > .label {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--theme-general-color);
      }

      > .description {
        font-size: 0.75rem;
        color: var(--theme-general-color-muted);
      }
    }
  }
}
</style>
