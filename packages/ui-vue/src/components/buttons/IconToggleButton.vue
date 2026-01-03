<script setup lang="ts">
type buttonType = 'normal' | 'primary' | 'danger' | 'accent'

withDefaults(
  defineProps<{
    icon: string
    tooltip: string
    active?: boolean
    disabled?: boolean
    type?: buttonType
  }>(),
  { active: false, disabled: false, type: 'normal' }
)
defineEmits<{ (e: 'click', event: MouseEvent): void }>()
</script>

<template>
  <button
    class="icon-toggle"
    type="button"
    :class="{ active, [type]: true }"
    :title="tooltip"
    :aria-label="tooltip"
    :aria-pressed="active ? 'true' : 'false'"
    :disabled="disabled"
    @click="$emit('click', $event)"
  >
    <Icon class="icon" :name="icon" />
  </button>
</template>

<style scoped>
.icon-toggle {
  width: 28px;
  height: 28px;
  border-radius: 0.5rem;
  border: 1px solid transparent;
  background: transparent;
  color: var(--theme-components-button-color);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    color 0.2s ease;

  &:hover {
    border-color: var(--theme-general-border-color);
    background: var(--theme-components-button-background-hover);
    color: var(--theme-components-button-color);
  }

  &.active {
    border-color: var(--theme-general-border-color-hover);
    color: var(--theme-general-color-hover);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    color: var(--theme-components-button-color-disabled);
    border-color: var(--theme-components-button-border-color-disabled);
    background: var(--theme-components-button-background-disabled);

    &:hover {
      background: var(--theme-components-button-background-disabled-hover);
      color: var(--theme-components-button-color-disabled-hover);
    }
  }

  &.primary {
    background: var(--theme-components-button-background-primary);
    color: var(--theme-components-button-color-primary);

    &:hover {
      background: var(--theme-components-button-background-primary-hover);
      color: var(--theme-components-button-color-primary);
    }

    &.active {
      background: var(--theme-components-button-background-primary-active);
      color: var(--theme-components-button-color-primary-active);
    }
  }

  &.danger {
    background: var(--theme-components-button-background-danger);
    color: var(--theme-components-button-color-danger);

    &:hover {
      background: var(--theme-components-button-background-danger-hover);
      color: var(--theme-components-button-color-danger);
    }

    &.active {
      background: var(--theme-components-button-background-danger-active);
      color: var(--theme-components-button-color-danger-active);
    }
  }

  > .icon {
    font-size: 0.75rem;
    line-height: 1;
  }
}
</style>
