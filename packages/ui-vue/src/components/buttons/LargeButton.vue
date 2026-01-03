<script setup lang="ts">
/**
 * Large button component for prominent selections like provider choices.
 * Displays a title, optional description, and optional icon.
 */
type buttonType = 'normal' | 'primary' | 'accent'

withDefaults(
  defineProps<{
    /** Button style type */
    type?: buttonType
    /** Main title/label */
    title: string
    /** Optional description text */
    description?: string
    /** Whether the button is selected/active */
    selected?: boolean
    /** Whether the button is disabled */
    disabled?: boolean
  }>(),
  {
    type: 'normal',
    description: undefined,
    selected: false,
    disabled: false,
  }
)
</script>

<template>
  <button
    class="large-button"
    :class="[type, { selected, disabled }]"
    :disabled="disabled"
    type="button"
  >
    <div class="content">
      <span class="title">{{ title }}</span>
      <span v-if="description" class="description">{{ description }}</span>
    </div>
    <slot name="icon" />
  </button>
</template>

<style scoped>
.large-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
  padding: 1rem 1.25rem;
  background: var(--theme-components-button-background);
  cursor: pointer;
  font-size: 1rem;
  color: var(--theme-general-color);
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    transform 0.1s ease;
  border: 1px solid var(--theme-general-border-color);
  border-radius: var(--border-radius-medium, 0.75rem);
  text-align: left;

  &:hover:not(:disabled) {
    background-color: var(--theme-components-button-background-hover);
    border-color: var(--theme-general-color-primary);
  }

  &:active:not(:disabled) {
    transform: scale(0.99);
  }

  &.selected {
    background-color: var(--theme-general-color-primary-bg, rgba(99, 102, 241, 0.1));
    border-color: var(--theme-general-color-primary);
  }

  &.primary {
    background-color: var(--theme-components-button-primary-background);
    color: var(--theme-components-button-primary-color);
    border: none;
  }

  &.accent {
    border-color: var(--theme-general-color-primary);
  }

  &:disabled,
  &.disabled {
    background-color: var(--theme-components-button-background-disabled);
    color: var(--theme-components-button-color-disabled);
    opacity: 0.5;
    cursor: not-allowed;
  }

  > .content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;

    > .title {
      font-weight: 500;
      font-size: 0.9375rem;
    }

    > .description {
      font-size: 0.8125rem;
      color: var(--theme-general-color-muted);
      line-height: 1.4;
    }
  }
}
</style>
