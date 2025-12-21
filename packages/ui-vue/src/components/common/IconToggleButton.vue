<script setup lang="ts">
withDefaults(
  defineProps<{
    icon: string
    tooltip: string
    active?: boolean
    disabled?: boolean
  }>(),
  { active: false, disabled: false }
)
defineEmits<{ (e: 'click', event: MouseEvent): void }>()
</script>

<template>
  <button
    class="icon-toggle"
    type="button"
    :class="{ active }"
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
    border-color: transparent;
    background: transparent;
  }
  > .icon {
    font-size: 0.75rem;
    line-height: 1;
  }
}
</style>
