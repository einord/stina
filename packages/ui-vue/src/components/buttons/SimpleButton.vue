<script setup lang="ts">
type buttonType = 'normal' | 'primary' | 'danger' | 'accent'
type htmlButtonType = 'button' | 'submit' | 'reset'

withDefaults(
  defineProps<{
    type?: buttonType
    htmlType?: htmlButtonType
    title?: string
    selected?: boolean
    disabled?: boolean
  }>(),
  {
    type: 'normal',
    htmlType: 'button',
    disabled: false,
    title: undefined,
  }
)
</script>

<template>
  <button
    class="simple-button"
    :class="[type, { selected }]"
    :title="title"
    :disabled="disabled"
    :type="htmlType"
  >
    <slot></slot>
  </button>
</template>

<style scoped>
.simple-button {
  padding: 0.75em 1em;
  background: var(--theme-components-button-background);
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--text);
  transition: background 0.15s ease;
  border: 1px solid var(--theme-general-border-color);
  border-radius: var(--border-radius-small, 0.375rem);
  display: grid;
  place-items: center;

  &:hover {
    background-color: var(--theme-components-button-background-hover);
  }

  &.danger {
    background-color: var(--theme-components-button-danger-background, #e74c3c);
    color: white;
  }

  &.primary {
    background-color: var(--theme-components-button-primary-background);
    color: var(--theme-components-button-primary-color);
    border: none;
  }

  &:disabled {
    background-color: var(--theme-components-button-background-disabled);
    color: var(--theme-components-button-color-disabled);
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
